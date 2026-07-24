// MOD-API: P2 VR chat panel — fully additive file.
// Third OpenVR overlay ("VRCX3") with its own offscreen CEF browser rendering
// vr-chat.html (1024x1024). Interactive: laser mouse input, SteamVR keyboard,
// window modes (world-locked / HUD; wrist later). Driven by the globaldb mod
// via ExecuteVrOverlayFunction("chat.*", json); actions flow back through
// AppApiVr.ChatPanelAction -> OverlayClient (OverlayMessageType.ChatAction).
using System;
using System.Numerics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using CefSharp;
using NLog;
using Silk.NET.Core.Native;
using Silk.NET.Direct3D11;
using Silk.NET.DXGI;
using Valve.VR;
using VRCX.Overlay;

namespace VRCX
{
    public class VRCXVRChatPanel : IDisposable
    {
        private static readonly Logger logger = LogManager.GetCurrentClassLogger();
        public static VRCXVRChatPanel Instance { get; private set; }

        private const int PANEL_SIZE = 1024;
        private const string OVERLAY_KEY = "VRCX3";

        private readonly bool _isLegacy;
        private OffScreenBrowser _browser;
        private ComPtr<ID3D11Texture2D> _texture;
        private ComPtr<ID3D11DeviceContext> _deviceContext;

        private ulong _handle;
        private bool _visible;

        // --- config (updated from the mod via chat.config) ---
        private volatile bool _enabled;
        private string _mode = "hud"; // "hud" | "world"
        private float _alpha = 0.9f;
        private float _curvature = 0.08f;
        private float _widthMeters = 0.9f;
        private bool _gestureEnabled;

        private bool _placeRequested = true; // world mode: (re)place at HMD pose
        private string _pendingKeyboardText;
        private bool _keyboardRequested;

        // gesture: long-press grip/A on either hand toggles minimize
        private readonly double[] _pressStart = new double[2];
        private double _lastGestureAt;

        public VRCXVRChatPanel(bool isLegacy)
        {
            _isLegacy = isLegacy;
            Instance = this;
            _browser = new OffScreenBrowser(
                Program.LaunchDebug ? "http://localhost:9000/vr-chat.html" : "file://vrcx/vr-chat.html",
                PANEL_SIZE,
                PANEL_SIZE,
                isLegacy
            );
        }

        /// Called from VRCXVRCef.SetupTextures() (MOD-API marker there).
        public void SetupTexture(ComPtr<ID3D11Device> device, ComPtr<ID3D11DeviceContext> deviceContext)
        {
            unsafe
            {
                _deviceContext = deviceContext;
                if ((IntPtr)_texture.Handle != IntPtr.Zero)
                    _texture.Dispose();

                SilkMarshal.ThrowHResult(device.CreateTexture2D(new Texture2DDesc
                {
                    Width = PANEL_SIZE,
                    Height = PANEL_SIZE,
                    MipLevels = 1,
                    ArraySize = 1,
                    Format = Format.FormatB8G8R8A8Unorm,
                    SampleDesc = new SampleDesc { Count = 1, Quality = 0 },
                    BindFlags = (uint)BindFlag.ShaderResource,
                    CPUAccessFlags = _isLegacy ? (uint)CpuAccessFlag.Write : (uint)CpuAccessFlag.None,
                    Usage = _isLegacy ? Usage.Dynamic : Usage.Default
                }, null, ref _texture));

                _browser.UpdateRender(device, deviceContext, _texture);
            }
        }

        /// Legacy render path — called each tick from the thread loop.
        public void RenderLegacy()
        {
            if (_isLegacy && _enabled)
                _browser.RenderToTexture(_deviceContext, _texture);
        }

        /// Overlay handle lost (VR quit).
        public void OnVrQuit()
        {
            _handle = 0;
            _visible = false;
        }

        /// Routed from ExecuteVrOverlayFunction("chat.<fn>", json).
        public void Execute(string function, string json)
        {
            if (function == "config")
                ApplyConfig(json);
            if (_browser == null || _browser.IsLoading || !_browser.CanExecuteJavascriptInMainFrame)
                return;
            _browser.ExecuteScriptAsync($"window.$vrchat && $vrchat.{function}", json);
        }

        private void ApplyConfig(string json)
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;
                if (root.TryGetProperty("enabled", out var en)) _enabled = en.GetBoolean();
                if (root.TryGetProperty("mode", out var mo))
                {
                    var mode = mo.GetString() ?? "hud";
                    if (mode != _mode)
                    {
                        _mode = mode;
                        _placeRequested = true;
                    }
                }
                if (root.TryGetProperty("alpha", out var al)) _alpha = Math.Clamp(al.GetSingle(), 0.2f, 1f);
                if (root.TryGetProperty("curvature", out var cu)) _curvature = Math.Clamp(cu.GetSingle(), 0f, 0.4f);
                if (root.TryGetProperty("width", out var wi)) _widthMeters = Math.Clamp(wi.GetSingle(), 0.3f, 2.5f);
                if (root.TryGetProperty("gesture", out var ge)) _gestureEnabled = ge.GetBoolean();
                if (root.TryGetProperty("place", out var pl) && pl.GetBoolean()) _placeRequested = true;
                _handleDirty = true;
            }
            catch (Exception e)
            {
                logger.Error(e, "chat panel config parse failed");
            }
        }

        private bool _handleDirty;

        /// Called by vr-chat.html via AppApiVr.ChatPanelAction.
        public void PanelAction(string json)
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                var type = doc.RootElement.TryGetProperty("type", out var t) ? t.GetString() : null;
                switch (type)
                {
                    case "keyboard":
                        _pendingKeyboardText = doc.RootElement.TryGetProperty("text", out var tx)
                            ? tx.GetString() ?? string.Empty
                            : string.Empty;
                        _keyboardRequested = true;
                        return;
                    case "config":
                        ApplyConfig(json);
                        break; // also forward: mod persists the change
                }
                OverlayClient.SendMessage(new OverlayMessage
                {
                    Type = OverlayMessageType.ChatAction,
                    Data = json
                });
            }
            catch (Exception e)
            {
                logger.Error(e, "chat panel action failed");
            }
        }

        /// Main per-frame processing — called from the VRCXVRCef thread loop.
        public void Process(CVRSystem system, CVROverlay overlay, bool dashboardVisible)
        {
            try
            {
                ProcessInternal(system, overlay, dashboardVisible);
            }
            catch (Exception e)
            {
                logger.Error(e, "chat panel process failed");
            }
        }

        private void ProcessInternal(CVRSystem system, CVROverlay overlay, bool dashboardVisible)
        {
            if (!_enabled)
            {
                if (_visible && _handle != 0)
                {
                    overlay.HideOverlay(_handle);
                    _visible = false;
                }
                return;
            }

            if (_handle == 0)
            {
                var err = overlay.FindOverlay(OVERLAY_KEY, ref _handle);
                if (err != EVROverlayError.None)
                {
                    if (err != EVROverlayError.UnknownOverlay)
                        return;
                    err = overlay.CreateOverlay(OVERLAY_KEY, "VRCX Pool Chat", ref _handle);
                    if (err != EVROverlayError.None)
                    {
                        logger.Error("CreateOverlay VRCX3: {0}", err);
                        return;
                    }
                }
                overlay.SetOverlayInputMethod(_handle, VROverlayInputMethod.Mouse);
                var scale = new HmdVector2_t { v0 = PANEL_SIZE, v1 = PANEL_SIZE };
                overlay.SetOverlayMouseScale(_handle, ref scale);
                overlay.SetOverlayFlag(_handle, VROverlayFlags.SendVRSmoothScrollEvents, true);
                _handleDirty = true;
                _placeRequested = true;
                _visible = false;
            }

            if (_handleDirty)
            {
                overlay.SetOverlayAlpha(_handle, _alpha);
                overlay.SetOverlayWidthInMeters(_handle, _widthMeters);
                overlay.SetOverlayCurvature(_handle, _curvature);
                _handleDirty = false;
            }

            if (_placeRequested)
            {
                ApplyTransform(system, overlay);
                _placeRequested = false;
            }

            // texture + visibility (hidden while the SteamVR dashboard is open)
            if (!dashboardVisible)
            {
                unsafe
                {
                    var texture = new Texture_t { handle = (IntPtr)_texture.Handle };
                    overlay.SetOverlayTexture(_handle, ref texture);
                }
                var bounds = new VRTextureBounds_t { uMin = 0f, uMax = 1f, vMin = 0f, vMax = 1f };
                overlay.SetOverlayTextureBounds(_handle, ref bounds);
                if (!_visible)
                {
                    overlay.ShowOverlay(_handle);
                    _visible = true;
                }
            }
            else if (_visible)
            {
                overlay.HideOverlay(_handle);
                _visible = false;
            }

            PumpOverlayEvents(overlay);

            // SteamVR routes overlay mouse events only in dashboard context —
            // head-locked/world overlays need their own laser (like OVR Toolkit).
            ProcessLaser(system, overlay);

            if (_keyboardRequested)
            {
                _keyboardRequested = false;
                overlay.ShowKeyboardForOverlay(_handle,
                    (int)EGamepadTextInputMode.k_EGamepadTextInputModeNormal,
                    (int)EGamepadTextInputLineMode.k_EGamepadTextInputLineModeSingleLine,
                    (uint)EKeyboardFlags.KeyboardFlag_Minimal,
                    "Pool-Chat", 512, _pendingKeyboardText ?? string.Empty, 0);
            }

            if (_gestureEnabled)
                ProcessGesture(system);
        }

        private void ApplyTransform(CVRSystem system, CVROverlay overlay)
        {
            if (_mode == "world")
            {
                var poses = new TrackedDevicePose_t[OpenVR.k_unMaxTrackedDeviceCount];
                system.GetDeviceToAbsoluteTrackingPose(ETrackingUniverseOrigin.TrackingUniverseStanding, 0, poses);
                var hmdPose = poses[OpenVR.k_unTrackedDeviceIndex_Hmd];
                if (!hmdPose.bPoseIsValid)
                    return;
                var hmd = ToMatrix4x4(hmdPose.mDeviceToAbsoluteTracking);
                var offset = Matrix4x4.CreateTranslation(0f, -0.1f, -0.9f);
                var m = offset * hmd;
                var hm34 = ToHmdMatrix34(m);
                overlay.SetOverlayTransformAbsolute(_handle,
                    ETrackingUniverseOrigin.TrackingUniverseStanding, ref hm34);
            }
            else // hud (head-locked)
            {
                var m = Matrix4x4.CreateTranslation(0f, -0.15f, -0.85f);
                var hm34 = ToHmdMatrix34(m);
                overlay.SetOverlayTransformTrackedDeviceRelative(_handle,
                    OpenVR.k_unTrackedDeviceIndex_Hmd, ref hm34);
            }
        }

        private void PumpOverlayEvents(CVROverlay overlay)
        {
            var e = new VREvent_t();
            var size = (uint)Marshal.SizeOf(e);
            var host = _browser?.GetBrowserHost();
            while (overlay.PollNextOverlayEvent(_handle, ref e, size))
            {
                var type = (EVREventType)e.eventType;
                // OpenVR overlay mouse coords: origin bottom-left (with mouse
                // scale = panel pixels) -> CEF expects top-left origin.
                var mx = (int)e.data.mouse.x;
                var my = PANEL_SIZE - (int)e.data.mouse.y;
                switch (type)
                {
                    case EVREventType.VREvent_MouseMove:
                        host?.SendMouseMoveEvent(mx, my, false, CefEventFlags.None);
                        break;
                    case EVREventType.VREvent_MouseButtonDown:
                        host?.SendMouseClickEvent(mx, my, MouseButtonType.Left, false, 1, CefEventFlags.None);
                        break;
                    case EVREventType.VREvent_MouseButtonUp:
                        host?.SendMouseClickEvent(mx, my, MouseButtonType.Left, true, 1, CefEventFlags.None);
                        break;
                    case EVREventType.VREvent_ScrollSmooth:
                        host?.SendMouseWheelEvent(PANEL_SIZE / 2, PANEL_SIZE / 2,
                            (int)(e.data.scroll.xdelta * 120), (int)(e.data.scroll.ydelta * 120), CefEventFlags.None);
                        break;
                    case EVREventType.VREvent_KeyboardDone:
                    {
                        var sb = new StringBuilder(1024);
                        OpenVR.Overlay.GetKeyboardText(sb, 1024);
                        _browser.ExecuteScriptAsync("window.$vrchat && $vrchat.keyboardDone", sb.ToString());
                        break;
                    }
                }
            }
        }

        // ------------------------------------------------------------ laser --
        private readonly bool[] _triggerDown = new bool[2];
        private bool _pointerWasOnPanel;

        private void ProcessLaser(CVRSystem system, CVROverlay overlay)
        {
            if (!_visible)
                return;
            var host = _browser?.GetBrowserHost();
            if (host == null)
                return;

            var poses = new TrackedDevicePose_t[OpenVR.k_unMaxTrackedDeviceCount];
            system.GetDeviceToAbsoluteTrackingPose(ETrackingUniverseOrigin.TrackingUniverseStanding, 0, poses);

            var bestDist = float.MaxValue;
            var bestU = 0f;
            var bestV = 0f;
            var bestHand = -1;
            var bestIdx = 0u;

            for (var i = 0u; i < OpenVR.k_unMaxTrackedDeviceCount; ++i)
            {
                var role = system.GetControllerRoleForTrackedDeviceIndex(i);
                if (role != ETrackedControllerRole.LeftHand && role != ETrackedControllerRole.RightHand)
                    continue;
                if (!poses[i].bPoseIsValid)
                    continue;
                var m = poses[i].mDeviceToAbsoluteTracking;
                var parms = new VROverlayIntersectionParams_t
                {
                    eOrigin = ETrackingUniverseOrigin.TrackingUniverseStanding,
                    vSource = new HmdVector3_t { v0 = m.m3, v1 = m.m7, v2 = m.m11 },
                    vDirection = new HmdVector3_t { v0 = -m.m2, v1 = -m.m6, v2 = -m.m10 }
                };
                var results = new VROverlayIntersectionResults_t();
                if (!overlay.ComputeOverlayIntersection(_handle, ref parms, ref results))
                    continue;
                if (results.fDistance < bestDist && results.fDistance < 3f)
                {
                    bestDist = results.fDistance;
                    bestU = results.vUVs.v0;
                    bestV = results.vUVs.v1;
                    bestHand = role == ETrackedControllerRole.LeftHand ? 0 : 1;
                    bestIdx = i;
                }
            }

            if (bestHand < 0)
            {
                if (_pointerWasOnPanel)
                {
                    _pointerWasOnPanel = false;
                    host.SendMouseMoveEvent(-1, -1, true, CefEventFlags.None);
                    _browser?.ExecuteScriptAsync("window.$vrchat && $vrchat.cursor(-1,-1)");
                }
                return;
            }
            _pointerWasOnPanel = true;

            // UV origin bottom-left -> CEF pixel coords top-left
            var x = (int)(bestU * PANEL_SIZE);
            var y = (int)((1f - bestV) * PANEL_SIZE);
            host.SendMouseMoveEvent(x, y, false, CefEventFlags.None);
            _browser?.ExecuteScriptAsync($"window.$vrchat && $vrchat.cursor({x},{y})");

            var state = new VRControllerState_t();
            if (!system.GetControllerState(bestIdx, ref state, (uint)Marshal.SizeOf(state)))
                return;

            var trigger = (state.ulButtonPressed & (1UL << (int)EVRButtonId.k_EButton_SteamVR_Trigger)) != 0;
            if (trigger && !_triggerDown[bestHand])
                host.SendMouseClickEvent(x, y, MouseButtonType.Left, false, 1, CefEventFlags.None);
            else if (!trigger && _triggerDown[bestHand])
                host.SendMouseClickEvent(x, y, MouseButtonType.Left, true, 1, CefEventFlags.None);
            _triggerDown[bestHand] = trigger;

            // joystick/touchpad Y scrollt die Nachrichtenliste
            var ay = state.rAxis0.y;
            if (Math.Abs(ay) > 0.4f)
                host.SendMouseWheelEvent(x, y, 0, (int)(ay * 40), CefEventFlags.None);
        }

        private void ProcessGesture(CVRSystem system)
        {
            var now = (DateTime.UtcNow - DateTime.UnixEpoch).TotalMilliseconds;
            if (now - _lastGestureAt < 1500)
                return;
            var state = new VRControllerState_t();
            var hand = 0;
            for (var i = 0u; i < OpenVR.k_unMaxTrackedDeviceCount && hand < 2; ++i)
            {
                var role = system.GetControllerRoleForTrackedDeviceIndex(i);
                if (role != ETrackedControllerRole.LeftHand && role != ETrackedControllerRole.RightHand)
                    continue;
                var idx = role == ETrackedControllerRole.LeftHand ? 0 : 1;
                hand++;
                if (!system.GetControllerState(i, ref state, (uint)Marshal.SizeOf(state)))
                    continue;
                // grip (Vive, mask 4) or A/X (Oculus, mask 128)
                var pressed = (state.ulButtonPressed & (4UL | 128UL)) != 0;
                if (pressed)
                {
                    if (_pressStart[idx] == 0)
                        _pressStart[idx] = now;
                }
                else
                {
                    if (_pressStart[idx] != 0 && now - _pressStart[idx] >= 1000)
                    {
                        _lastGestureAt = now;
                        _browser?.ExecuteScriptAsync("window.$vrchat && $vrchat.gestureToggle()");
                    }
                    _pressStart[idx] = 0;
                }
            }
        }

        private static Matrix4x4 ToMatrix4x4(HmdMatrix34_t m)
        {
            return new Matrix4x4(
                m.m0, m.m4, m.m8, 0f,
                m.m1, m.m5, m.m9, 0f,
                m.m2, m.m6, m.m10, 0f,
                m.m3, m.m7, m.m11, 1f);
        }

        private static HmdMatrix34_t ToHmdMatrix34(Matrix4x4 m)
        {
            return new HmdMatrix34_t
            {
                m0 = m.M11, m1 = m.M21, m2 = m.M31, m3 = m.M41,
                m4 = m.M12, m5 = m.M22, m6 = m.M32, m7 = m.M42,
                m8 = m.M13, m9 = m.M23, m10 = m.M33, m11 = m.M43
            };
        }

        public void Dispose()
        {
            if (_handle != 0)
            {
                try { OpenVR.Overlay?.DestroyOverlay(_handle); } catch { }
                _handle = 0;
            }
            _browser?.Dispose();
            _browser = null;
            _texture.Dispose();
            _texture = default;
            if (Instance == this)
                Instance = null;
        }
    }
}
