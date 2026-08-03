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
        // Mini und großes Panel werden getrennt positioniert: der Mini kann am
        // Handgelenk sitzen, während das große Panel frei in der Welt steht.
        private string _miniMode = "wrist"; // "wrist" | "hud" | "world"
        private string _bigMode = "hud"; // "hud" (kopffest, verschiebbar) | "world"
        private string _placeHand = "right"; // Hand fürs Platzieren/Draggen
        private bool _dragging; // Dragbar: Panel folgt bis Trigger-Release
        private uint _dragIdx;
        private float _alpha = 0.9f;
        private float _curvature = 0.08f;
        private float _widthMeters = 0.6f;
        private bool _gestureEnabled;
        // Laser-Kalibrierung als WINKEL (Grad) statt cm-Offset: ein cm-Versatz
        // der Ray-Quelle wandert über die Panelfläche (Parallaxe), eine
        // Winkelkorrektur bleibt über Distanz und Fläche konstant.
        private float _laserPitchDeg = 41.5f; // Ray-Neigung nach unten (Index-kalibriert)
        private float _laserYawDeg = 5.9f; // Ray-Drehung seitlich (Index-kalibriert)
        // Kopffestes großes Panel: per Dragbar verschiebbarer Offset (Meter,
        // HMD-lokal). Default entspricht der bisherigen festen Position.
        private Vector3 _hudOffset = new Vector3(0f, -0.15f, -0.85f);
        private bool _dragLock; // Settings offen => Dragbar inaktiv
        // Wrist-Mini: exakt über dem VRCX-Wrist-Overlay + User-Offset
        private bool _wristLock; // Verschieben gesperrt
        private bool _wristGate; // false = Mini dauerhaft sichtbar, true = Blickwinkel-Gate
        // "auto" folgt der VRCX-Overlay-Hand, "left"/"right" überstimmen sie.
        // Wichtig: der VRCX-Wert darf NICHT hart filtern, sonst lässt sich der
        // Chat-Mini nie auf die andere Hand legen.
        private string _wristHand = "auto";
        // Mini in "hud" (HMD-lokal, Meter) bzw. "world" (Weltposition)
        private Vector3 _miniOffset = new Vector3(0f, -0.22f, -0.6f);
        private Vector3 _miniWorldPos = new Vector3(0f, 1.2f, -0.8f);
        private bool _miniWorldPlaced;
        private float _miniWidth = 0.26f;
        private float _wristOffX, _wristOffY, _wristOffZ; // cm, Controller-lokal
        private float _wristAngleDeg = 30f; // Sichtbarkeits-Kegel (Blick aufs Handgelenk)
        private float _wristHoldSec = 1.2f; // Nachleuchten nach dem Wegdrehen
        private DateTime _angleVisibleUntil = DateTime.MinValue;
        private int _overlayHand; // VRCX-Setting: 0 beide, 1 links, 2 rechts
        private bool _wristMoving;
        private uint _wristMoveIdx;
        private float _wristMoveDist;
        private bool _miniPressActive;
        private double _miniPressStartMs;
        private uint _miniPressIdx;
        private int _miniPressHand;
        private int _miniPressX, _miniPressY;
        private Vector3 _lastPanelPos = new Vector3(0, 1.2f, -0.8f);
        private bool _worldPlaced; // world-Modus: Position schon einmal gesetzt
        private float _dragDist = 1f;
        private Vector3 _dragOffset = Vector3.Zero;
        private bool _big; // "Groß"-Modus: volle UI, bleibt bis Minimieren
        private float _flashSec = 10f;

        private bool _placeRequested = true; // world mode: (re)place at HMD pose
        private bool _placing; // Platzieren: Panel folgt dem Laser, Trigger fixiert
        private DateTime _flashUntil = DateTime.MinValue; // Mini nach neuer Nachricht
        private uint _wristIndex = OpenVR.k_unTrackedDeviceIndexInvalid;
        private DateTime _wristUntil = DateTime.MinValue;
        private int _hapticPulses;
        private string _hapticHand = "both";
        private string _pendingKeyboardText;
        private bool _keyboardRequested;

        // Geste: Taste, Hand, Haltezeit und Auslöseart sind konfigurierbar —
        // Grip auf beiden Händen kollidiert im Spiel ständig mit dem Greifen.
        private readonly double[] _pressStart = new double[2];
        private readonly double[] _lastTapAt = new double[2];
        private double _lastGestureAt;
        private ulong _gestureMask = 4UL; // Default: Grip
        private string _gestureHand = "both"; // "both" | "left" | "right"
        private float _gestureHoldMs = 1000f;
        private string _gestureMode = "hold"; // "hold" | "double" (Doppeltipp)
        private bool _learningGesture; // Lernmodus: nächste Taste übernehmen

        // Trigger nie als Geste zulassen — er bedient das Panel.
        private const ulong TRIGGER_MASK = 1UL << (int)EVRButtonId.k_EButton_SteamVR_Trigger;

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
            if (function == "learnGesture")
            {
                _learningGesture = true;
                logger.Info("gesture learn mode aktiv");
                return;
            }
            if (function == "haptic")
            {
                try
                {
                    using var doc = JsonDocument.Parse(json);
                    _hapticHand = doc.RootElement.TryGetProperty("hand", out var h)
                        ? h.GetString() ?? "both"
                        : "both";
                }
                catch { }
                _hapticPulses = 10; // ~10 Frames à 32 ms Buzz
                return;
            }
            if (!BrowserReady())
            {
                // Panel lädt noch: letzten Stand puffern und nach dem Laden
                // nachliefern — sonst bleibt das Panel leer, bis sich im Mod
                // zufällig wieder etwas ändert (Diff-Poll).
                if (function == "update" || function == "config")
                    lock (_pending) _pending[function] = json;
                return;
            }
            _browser.ExecuteScriptAsync($"window.$vrchat && $vrchat.{function}", json);
        }

        private readonly System.Collections.Generic.Dictionary<string, string> _pending = new();

        private bool BrowserReady()
        {
            return _browser != null && !_browser.IsLoading && _browser.CanExecuteJavascriptInMainFrame;
        }

        /// Gepufferte config/update nach dem Laden des Panels nachreichen.
        private void FlushPending()
        {
            if (!BrowserReady())
                return;
            System.Collections.Generic.KeyValuePair<string, string>[] items;
            lock (_pending)
            {
                if (_pending.Count == 0)
                    return;
                items = new System.Collections.Generic.KeyValuePair<string, string>[_pending.Count];
                ((System.Collections.Generic.ICollection<System.Collections.Generic.KeyValuePair<string, string>>)_pending)
                    .CopyTo(items, 0);
                _pending.Clear();
            }
            foreach (var item in items)
            {
                // config zuerst, damit update nicht in eine leere Konfig läuft
                if (item.Key == "config")
                    _browser.ExecuteScriptAsync("window.$vrchat && $vrchat.config", item.Value);
            }
            foreach (var item in items)
            {
                if (item.Key != "config")
                    _browser.ExecuteScriptAsync($"window.$vrchat && $vrchat.{item.Key}", item.Value);
            }
            logger.Info("chat panel: {0} gepufferte Nachrichten nachgereicht", items.Length);
        }

        private void ApplyConfig(string json)
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;
                if (root.TryGetProperty("enabled", out var en)) _enabled = en.GetBoolean();
                if (root.TryGetProperty("miniMode", out var mm))
                {
                    var mini = mm.GetString() ?? "wrist";
                    if (mini != _miniMode)
                    {
                        _miniMode = mini;
                        _placeRequested = true;
                    }
                }
                if (root.TryGetProperty("bigMode", out var bm))
                {
                    var big = bm.GetString() ?? "hud";
                    if (big != _bigMode)
                    {
                        _bigMode = big;
                        _placeRequested = true;
                    }
                }
                if (root.TryGetProperty("hudOffX", out var hx))
                    _hudOffset.X = Math.Clamp(hx.GetSingle(), -150f, 150f) / 100f;
                if (root.TryGetProperty("hudOffY", out var hy))
                    _hudOffset.Y = Math.Clamp(hy.GetSingle(), -150f, 150f) / 100f;
                if (root.TryGetProperty("hudOffZ", out var hz))
                    _hudOffset.Z = Math.Clamp(hz.GetSingle(), -300f, -10f) / 100f;
                if (root.TryGetProperty("alpha", out var al)) _alpha = Math.Clamp(al.GetSingle(), 0.2f, 1f);
                if (root.TryGetProperty("curvature", out var cu)) _curvature = Math.Clamp(cu.GetSingle(), 0f, 0.4f);
                if (root.TryGetProperty("width", out var wi)) _widthMeters = Math.Clamp(wi.GetSingle(), 0.2f, 2.5f);
                if (root.TryGetProperty("gesture", out var ge)) _gestureEnabled = ge.GetBoolean();
                if (root.TryGetProperty("laserPitch", out var lp)) _laserPitchDeg = Math.Clamp(lp.GetSingle(), -30f, 90f);
                if (root.TryGetProperty("laserYaw", out var lyw)) _laserYawDeg = Math.Clamp(lyw.GetSingle(), -30f, 30f);
                if (root.TryGetProperty("flashSec", out var fs)) _flashSec = Math.Clamp(fs.GetSingle(), 2f, 120f);
                if (root.TryGetProperty("big", out var bg))
                {
                    var big = bg.GetBoolean();
                    if (big != _big)
                    {
                        _big = big;
                        _placeRequested = true;
                    }
                }
                if (root.TryGetProperty("flash", out var fl) && fl.GetBoolean())
                    _flashUntil = DateTime.UtcNow.AddSeconds(_flashSec);
                if (root.TryGetProperty("place", out var pl) && pl.GetBoolean()) _placeRequested = true;
                if (root.TryGetProperty("placeMode", out var pm) && pm.GetBoolean()) _placing = true;
                if (root.TryGetProperty("placeHand", out var ph)) _placeHand = ph.GetString() ?? "right";
                if (root.TryGetProperty("dragLock", out var dl)) _dragLock = dl.GetBoolean();
                if (root.TryGetProperty("wristLock", out var wl)) _wristLock = wl.GetBoolean();
                if (root.TryGetProperty("wristGate", out var wg)) _wristGate = wg.GetBoolean();
                if (root.TryGetProperty("wristHand", out var wh)) _wristHand = wh.GetString() ?? "auto";
                if (root.TryGetProperty("wristAngle", out var wa)) _wristAngleDeg = Math.Clamp(wa.GetSingle(), 5f, 90f);
                if (root.TryGetProperty("wristHold", out var whd)) _wristHoldSec = Math.Clamp(whd.GetSingle(), 0f, 10f);
                if (root.TryGetProperty("gestureMask", out var gm)) _gestureMask = gm.GetUInt64();
                if (root.TryGetProperty("gestureHand", out var gh)) _gestureHand = gh.GetString() ?? "both";
                if (root.TryGetProperty("gestureHold", out var gho))
                    _gestureHoldMs = Math.Clamp(gho.GetSingle(), 200f, 4000f);
                if (root.TryGetProperty("gestureMode", out var gmo)) _gestureMode = gmo.GetString() ?? "hold";
                if (root.TryGetProperty("miniOffX", out var mox))
                    _miniOffset.X = Math.Clamp(mox.GetSingle(), -150f, 150f) / 100f;
                if (root.TryGetProperty("miniOffY", out var moy))
                    _miniOffset.Y = Math.Clamp(moy.GetSingle(), -150f, 150f) / 100f;
                if (root.TryGetProperty("miniOffZ", out var moz))
                    _miniOffset.Z = Math.Clamp(moz.GetSingle(), -300f, -10f) / 100f;
                if (root.TryGetProperty("miniWidth", out var mw))
                    _miniWidth = Math.Clamp(mw.GetSingle(), 0.1f, 1.5f);
                if (root.TryGetProperty("wristOffX", out var wx)) _wristOffX = Math.Clamp(wx.GetSingle(), -40f, 40f);
                if (root.TryGetProperty("wristOffY", out var wy)) _wristOffY = Math.Clamp(wy.GetSingle(), -40f, 40f);
                if (root.TryGetProperty("wristOffZ", out var wz)) _wristOffZ = Math.Clamp(wz.GetSingle(), -40f, 40f);
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
                logger.Info("chat panel action: {0}", type); // Diagnose Send-Pfad
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
        /// wristIndex/wristUntil mirror the VRCX wrist overlay (hand + its
        /// visibility window) so the mini panel can piggyback on it.
        public void Process(CVRSystem system, CVROverlay overlay, bool dashboardVisible,
            uint wristIndex, DateTime wristUntil, int overlayHand = 0)
        {
            try
            {
                // wristIndex NICHT übernehmen: das ist die Hand, die zuletzt
                // die VRCX-Menütaste gedrückt hat, und sie würde die eigene
                // Seitenwahl jedes Mal überschreiben.
                if (wristUntil > _wristUntil)
                    _wristUntil = wristUntil;
                _overlayHand = overlayHand;
                FlushPending(); // vor dem Rendern: gepufferten Startzustand nachreichen
                ProcessInternal(system, overlay, dashboardVisible);
            }
            catch (Exception e)
            {
                logger.Error(e, "chat panel process failed");
            }
        }

        private void ProcessInternal(CVRSystem system, CVROverlay overlay, bool dashboardVisible)
        {
            if (_wristMoving)
                ProcessWristMove(system);
            else if (_miniPressActive)
                ProcessMiniPress(system);

            // Minimiert: im wrist-Modus ist der Mini standardmäßig DAUERHAFT am
            // Handgelenk sichtbar. Nur mit eingeschaltetem Blickwinkel-Gate
            // (⚙ bzw. Desktop-Settings) erscheint er wie bisher nur im
            // Flash-Fenster, im VRCX-Wrist-Fenster oder beim Hinsehen.
            // hud/world bleiben unsichtbar bis Flash/Geste (keine Geisterfläche).
            var wantVisible = _enabled && !dashboardVisible;
            if (wantVisible && !_big && !_placing && !_dragging && !_wristMoving)
            {
                var now = DateTime.UtcNow;
                if (_miniMode != "wrist")
                {
                    // Kopffest / frei in der Welt: der Mini ist eine bewusst
                    // platzierte Fläche und bleibt sichtbar (sonst hätte man
                    // nichts zum Hinziehen).
                    wantVisible = true;
                }
                else if (_wristGate)
                {
                    UpdateWristAngleVisibility(system);
                    wantVisible = now <= _flashUntil || now <= _wristUntil ||
                                  now <= _angleVisibleUntil;
                }
                else
                {
                    PickWristHand(system);
                    wantVisible = _wristIndex != OpenVR.k_unTrackedDeviceIndexInvalid;
                }
            }

            if (!wantVisible)
            {
                if (_visible && _handle != 0)
                {
                    overlay.HideOverlay(_handle);
                    _visible = false;
                }
                if (_enabled && (_gestureEnabled || _learningGesture))
                    ProcessGesture(system); // Geste kann Mini/Groß auch aus dem Hidden-Zustand öffnen
                if (_enabled)
                    ProcessHaptics(system);
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

            if (_placing || _dragging)
            {
                ProcessPlacement(system, overlay);
            }
            else if (!_big)
            {
                ApplyMiniTransform(system, overlay); // jede Frame (Hand/HMD folgt)
            }
            else if (_placeRequested || _bigMode == "world")
            {
                // world: jede Frame — sonst bleibt das Billboard beim
                // Herumgehen in der alten Blickrichtung stehen.
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
                var kerr = overlay.ShowKeyboardForOverlay(_handle,
                    (int)EGamepadTextInputMode.k_EGamepadTextInputModeNormal,
                    (int)EGamepadTextInputLineMode.k_EGamepadTextInputLineModeSingleLine,
                    (uint)EKeyboardFlags.KeyboardFlag_Minimal,
                    "Pool-Chat", 512, _pendingKeyboardText ?? string.Empty, 0);
                logger.Info("ShowKeyboardForOverlay: {0}", kerr); // Diagnose
            }

            if (_gestureEnabled || _learningGesture)
                ProcessGesture(system);
            ProcessHaptics(system);
        }

        // -------------------------------------------------------- transforms --
        /// Fläche an pos, aufrecht, zugewandt zu lookFrom (Billboard).
        private static Matrix4x4 Billboard(Vector3 pos, Vector3 lookFrom)
        {
            var z = Vector3.Normalize(lookFrom - pos);
            if (float.IsNaN(z.X)) z = new Vector3(0, 0, 1);
            var x = Vector3.Normalize(Vector3.Cross(new Vector3(0, 1, 0), z));
            if (float.IsNaN(x.X)) x = new Vector3(1, 0, 0);
            var y = Vector3.Cross(z, x);
            return new Matrix4x4(
                x.X, x.Y, x.Z, 0,
                y.X, y.Y, y.Z, 0,
                z.X, z.Y, z.Z, 0,
                pos.X, pos.Y, pos.Z, 1);
        }

        /// Mini-Ansicht: am Handgelenk, kopffest oder frei in der Welt.
        private void ApplyMiniTransform(CVRSystem system, CVROverlay overlay)
        {
            if (_miniMode == "hud")
            {
                var mm = Matrix4x4.CreateTranslation(_miniOffset);
                var mh34 = ToHmdMatrix34(mm);
                overlay.SetOverlayWidthInMeters(_handle, _miniWidth);
                overlay.SetOverlayTransformTrackedDeviceRelative(_handle,
                    OpenVR.k_unTrackedDeviceIndex_Hmd, ref mh34);
                return;
            }
            if (_miniMode == "world")
            {
                // Frei abgelegt: dauerhaftes Billboarding, damit die Fläche
                // auch beim Herumgehen lesbar bleibt.
                var poses = new TrackedDevicePose_t[OpenVR.k_unTrackedDeviceIndex_Hmd + 1];
                system.GetDeviceToAbsoluteTrackingPose(ETrackingUniverseOrigin.TrackingUniverseStanding, 0, poses);
                var hmdPose = poses[OpenVR.k_unTrackedDeviceIndex_Hmd];
                if (!hmdPose.bPoseIsValid)
                    return;
                var hm = ToMatrix4x4(hmdPose.mDeviceToAbsoluteTracking);
                if (!_miniWorldPlaced)
                {
                    var seed = Matrix4x4.CreateTranslation(0f, -0.22f, -0.6f) * hm;
                    _miniWorldPos = new Vector3(seed.M41, seed.M42, seed.M43);
                    _miniWorldPlaced = true;
                }
                var bhm34 = ToHmdMatrix34(
                    Billboard(_miniWorldPos, new Vector3(hm.M41, hm.M42, hm.M43)));
                overlay.SetOverlayWidthInMeters(_handle, _miniWidth);
                overlay.SetOverlayTransformAbsolute(_handle,
                    ETrackingUniverseOrigin.TrackingUniverseStanding, ref bhm34);
                return;
            }
            if (_wristIndex == OpenVR.k_unTrackedDeviceIndexInvalid)
                return;
            var role = system.GetControllerRoleForTrackedDeviceIndex(_wristIndex);
            var left = role == ETrackedControllerRole.LeftHand;
            // Exakt die Transform des VRCX-Wrist-Overlays + User-Offset
            var m = Matrix4x4.CreateScale(0.25f);
            m *= WristRotation(left);
            m *= Matrix4x4.CreateTranslation(WristBasePos(left) + WristUserOffset());
            var hm34 = ToHmdMatrix34(m);
            overlay.SetOverlayWidthInMeters(_handle, 1f); // wie VRCX1 (Scale 0.25 => ~25 cm)
            overlay.SetOverlayTransformTrackedDeviceRelative(_handle, _wristIndex, ref hm34);
        }

        private static Matrix4x4 WristRotation(bool left)
        {
            var deg = (float)(Math.PI / 180f);
            return left
                ? Matrix4x4.CreateRotationX(90f * deg) *
                  Matrix4x4.CreateRotationY(90f * deg) *
                  Matrix4x4.CreateRotationZ(-90f * deg)
                : Matrix4x4.CreateRotationX(-90f * deg) *
                  Matrix4x4.CreateRotationY(-90f * deg) *
                  Matrix4x4.CreateRotationZ(-90f * deg);
        }

        private static Vector3 WristBasePos(bool left)
        {
            return left ? new Vector3(-0.07f, -0.05f, 0.06f) : new Vector3(0.07f, -0.05f, 0.06f);
        }

        private Vector3 WristUserOffset()
        {
            return new Vector3(_wristOffX / 100f, _wristOffY / 100f, _wristOffZ / 100f);
        }

        /// "auto" lässt BEIDE Hände zu — mit Blickwinkel-Gate gewinnt die, auf
        /// die man schaut, ohne Gate die von VRCX bevorzugte Seite. Eine
        /// explizite Wahl schränkt auf genau diese Hand ein. Der VRCX-Wert darf
        /// nie hart filtern, sonst blockiert eine dort auf "rechts" gestellte
        /// Overlay-Hand die linke Seite dauerhaft.
        private bool HandAllowed(bool isLeft)
        {
            if (_wristHand == "left") return isLeft;
            if (_wristHand == "right") return !isLeft;
            return true; // auto
        }

        /// Bevorzugte Seite, wenn ohne Gate genau eine gewählt werden muss.
        private bool PreferLeftWrist()
        {
            if (_wristHand == "left") return true;
            if (_wristHand == "right") return false;
            return _overlayHand != 2; // auto: VRCX-Overlay-Hand als Vorgabe
        }

        /// Ohne Blickwinkel-Gate: Hand fest wählen. Ohne gültige
        /// Controller-Pose bleibt der Mini aus — sonst hätte er keine Transform.
        private void PickWristHand(CVRSystem system)
        {
            var poses = new TrackedDevicePose_t[OpenVR.k_unMaxTrackedDeviceCount];
            system.GetDeviceToAbsoluteTrackingPose(ETrackingUniverseOrigin.TrackingUniverseStanding, 0, poses);
            var wantLeft = PreferLeftWrist();

            var fallback = OpenVR.k_unTrackedDeviceIndexInvalid;
            for (var i = 0u; i < OpenVR.k_unMaxTrackedDeviceCount; ++i)
            {
                var role = system.GetControllerRoleForTrackedDeviceIndex(i);
                var isLeft = role == ETrackedControllerRole.LeftHand;
                var isRight = role == ETrackedControllerRole.RightHand;
                if ((!isLeft && !isRight) || !poses[i].bPoseIsValid)
                    continue;
                if (!HandAllowed(isLeft))
                    continue;
                if (fallback == OpenVR.k_unTrackedDeviceIndexInvalid)
                    fallback = i;
                if (isLeft == wantLeft)
                {
                    _wristIndex = i;
                    return;
                }
            }
            _wristIndex = fallback;
        }

        /// Sichtbarkeit per Handgelenkwinkel (wie OVR Toolkit): Mini zeigt sich,
        /// wenn seine Fläche zum HMD gedreht ist. Wählt zugleich die Hand.
        private void UpdateWristAngleVisibility(CVRSystem system)
        {
            var poses = new TrackedDevicePose_t[OpenVR.k_unMaxTrackedDeviceCount];
            system.GetDeviceToAbsoluteTrackingPose(ETrackingUniverseOrigin.TrackingUniverseStanding, 0, poses);
            var hmd = poses[OpenVR.k_unTrackedDeviceIndex_Hmd];
            if (!hmd.bPoseIsValid)
                return;
            var hmdPos = new Vector3(hmd.mDeviceToAbsoluteTracking.m3,
                hmd.mDeviceToAbsoluteTracking.m7, hmd.mDeviceToAbsoluteTracking.m11);
            var cosThresh = (float)Math.Cos(_wristAngleDeg * Math.PI / 180f);

            for (var i = 0u; i < OpenVR.k_unMaxTrackedDeviceCount; ++i)
            {
                var role = system.GetControllerRoleForTrackedDeviceIndex(i);
                var isLeft = role == ETrackedControllerRole.LeftHand;
                var isRight = role == ETrackedControllerRole.RightHand;
                if (!isLeft && !isRight)
                    continue;
                // Seitenwahl gilt auch mit Blickwinkel-Gate; bei "auto" sind
                // beide Hände zugelassen und die angeschaute gewinnt.
                if (!HandAllowed(isLeft))
                    continue;
                if (!poses[i].bPoseIsValid)
                    continue;

                var cm = ToMatrix4x4(poses[i].mDeviceToAbsoluteTracking);
                var nLocal = Vector3.TransformNormal(new Vector3(0, 0, 1), WristRotation(isLeft));
                var nWorld = Vector3.Normalize(Vector3.TransformNormal(nLocal, cm));
                var oPos = Vector3.Transform(WristBasePos(isLeft) + WristUserOffset(), cm);
                var toHmd = Vector3.Normalize(hmdPos - oPos);
                if (Vector3.Dot(nWorld, toHmd) > cosThresh)
                {
                    _wristIndex = i;
                    _angleVisibleUntil = DateTime.UtcNow.AddSeconds(_wristHoldSec);
                    return;
                }
            }
        }

        /// Langdruck-Verschieben des Wrist-Minis: folgt dem Laserpunkt, bis der
        /// Trigger losgelassen wird; der Controller-lokale Offset wird
        /// gespeichert (persistiert über den Mod).
        private void ProcessWristMove(CVRSystem system)
        {
            var poses = new TrackedDevicePose_t[OpenVR.k_unMaxTrackedDeviceCount];
            system.GetDeviceToAbsoluteTrackingPose(ETrackingUniverseOrigin.TrackingUniverseStanding, 0, poses);
            var needWrist = _miniMode == "wrist";
            if (!poses[_wristMoveIdx].bPoseIsValid ||
                (needWrist && _wristIndex == OpenVR.k_unTrackedDeviceIndexInvalid))
            {
                EndWristMove();
                return;
            }

            var state = new VRControllerState_t();
            var trigger = system.GetControllerState(_wristMoveIdx, ref state, (uint)Marshal.SizeOf(state)) &&
                (state.ulButtonPressed & (1UL << (int)EVRButtonId.k_EButton_SteamVR_Trigger)) != 0;
            if (!trigger)
            {
                EndWristMove();
                return;
            }

            // Zielpunkt = Laserpunkt der ziehenden Hand in fester Distanz
            var mm = poses[_wristMoveIdx].mDeviceToAbsoluteTracking;
            var moveLeft = system.GetControllerRoleForTrackedDeviceIndex(_wristMoveIdx) ==
                ETrackedControllerRole.LeftHand;
            var src = LaserSource(mm, moveLeft);
            var target = src + LaserDirection(mm, moveLeft) * _wristMoveDist;

            if (_miniMode == "world")
            {
                _miniWorldPos = target;
                _miniWorldPlaced = true;
                return;
            }
            if (_miniMode == "hud")
            {
                // Zielpunkt in HMD-lokale Koordinaten — der Mini bleibt kopffest
                var hmdPose = poses[OpenVR.k_unTrackedDeviceIndex_Hmd];
                if (!hmdPose.bPoseIsValid ||
                    !Matrix4x4.Invert(ToMatrix4x4(hmdPose.mDeviceToAbsoluteTracking), out var invHmd))
                    return;
                var lp = Vector3.Transform(target, invHmd);
                _miniOffset = new Vector3(
                    Math.Clamp(lp.X, -1.5f, 1.5f),
                    Math.Clamp(lp.Y, -1.5f, 1.5f),
                    Math.Clamp(lp.Z, -3f, -0.1f));
                return;
            }

            // wrist: in Controller-Space der Wrist-Hand umrechnen => neuer Offset
            var wristM = ToMatrix4x4(poses[_wristIndex].mDeviceToAbsoluteTracking);
            if (!Matrix4x4.Invert(wristM, out var inv))
                return;
            var local = Vector3.Transform(target, inv);
            var isLeftWrist = system.GetControllerRoleForTrackedDeviceIndex(_wristIndex) == ETrackedControllerRole.LeftHand;
            var off = (local - WristBasePos(isLeftWrist)) * 100f; // in cm
            _wristOffX = Math.Clamp(off.X, -40f, 40f);
            _wristOffY = Math.Clamp(off.Y, -40f, 40f);
            _wristOffZ = Math.Clamp(off.Z, -40f, 40f);
        }

        private static double NowMs()
        {
            return (DateTime.UtcNow - DateTime.UnixEpoch).TotalMilliseconds;
        }

        /// Mini-Press: nach 400 ms Halten in den Verschiebe-Modus wechseln,
        /// bei früherem Loslassen als Klick (Groß öffnen) durchreichen.
        private void ProcessMiniPress(CVRSystem system)
        {
            var state = new VRControllerState_t();
            var held = system.GetControllerState(_miniPressIdx, ref state, (uint)Marshal.SizeOf(state)) &&
                (state.ulButtonPressed & (1UL << (int)EVRButtonId.k_EButton_SteamVR_Trigger)) != 0;

            if (held && NowMs() - _miniPressStartMs >= 400)
            {
                _miniPressActive = false;
                _wristMoving = true;
                _wristMoveIdx = _miniPressIdx;
                // Distanz Laserquelle -> Mini beim Start
                var poses = new TrackedDevicePose_t[OpenVR.k_unMaxTrackedDeviceCount];
                system.GetDeviceToAbsoluteTrackingPose(ETrackingUniverseOrigin.TrackingUniverseStanding, 0, poses);
                _wristMoveDist = 0.4f;
                if (poses[_miniPressIdx].bPoseIsValid)
                {
                    var mm = poses[_miniPressIdx].mDeviceToAbsoluteTracking;
                    var src = LaserSource(mm,
                        system.GetControllerRoleForTrackedDeviceIndex(_miniPressIdx) == ETrackedControllerRole.LeftHand);
                    var oPos = CurrentMiniPos(system, poses);
                    if (oPos.HasValue)
                        _wristMoveDist = Math.Clamp(Vector3.Distance(src, oPos.Value), 0.15f, 2.5f);
                }
                _browser?.ExecuteScriptAsync("window.$vrchat && $vrchat.moving(true)");
                return;
            }

            if (!held)
            {
                // kurzer Klick => Groß öffnen (synthetischer Klick)
                _miniPressActive = false;
                _triggerDown[_miniPressHand] = false;
                var host = _browser?.GetBrowserHost();
                host?.SendMouseClickEvent(_miniPressX, _miniPressY, MouseButtonType.Left, false, 1, CefEventFlags.None);
                host?.SendMouseClickEvent(_miniPressX, _miniPressY, MouseButtonType.Left, true, 1, CefEventFlags.None);
            }
        }

        /// Aktuelle Mini-Position in Weltkoordinaten (für den Greifabstand).
        private Vector3? CurrentMiniPos(CVRSystem system, TrackedDevicePose_t[] poses)
        {
            if (_miniMode == "world")
                return _miniWorldPlaced ? _miniWorldPos : (Vector3?)null;
            if (_miniMode == "hud")
            {
                var hmdPose = poses[OpenVR.k_unTrackedDeviceIndex_Hmd];
                if (!hmdPose.bPoseIsValid)
                    return null;
                var w = Matrix4x4.CreateTranslation(_miniOffset) *
                    ToMatrix4x4(hmdPose.mDeviceToAbsoluteTracking);
                return new Vector3(w.M41, w.M42, w.M43);
            }
            if (_wristIndex == OpenVR.k_unTrackedDeviceIndexInvalid || !poses[_wristIndex].bPoseIsValid)
                return null;
            var wm = ToMatrix4x4(poses[_wristIndex].mDeviceToAbsoluteTracking);
            var isLeft = system.GetControllerRoleForTrackedDeviceIndex(_wristIndex) == ETrackedControllerRole.LeftHand;
            return Vector3.Transform(WristBasePos(isLeft) + WristUserOffset(), wm);
        }

        private void EndWristMove()
        {
            _wristMoving = false;
            _browser?.ExecuteScriptAsync("window.$vrchat && $vrchat.moving(false)");
            var ci = System.Globalization.CultureInfo.InvariantCulture;
            string json;
            if (_miniMode == "hud")
            {
                json = "{\"type\":\"config\"" +
                    ",\"miniOffX\":" + (_miniOffset.X * 100f).ToString("0.#", ci) +
                    ",\"miniOffY\":" + (_miniOffset.Y * 100f).ToString("0.#", ci) +
                    ",\"miniOffZ\":" + (_miniOffset.Z * 100f).ToString("0.#", ci) + "}";
                logger.Info("mini moved (hud): {0:0.00}/{1:0.00}/{2:0.00} m",
                    _miniOffset.X, _miniOffset.Y, _miniOffset.Z);
            }
            else if (_miniMode == "world")
            {
                // Weltposition ist sitzungslokal (Raum-Ursprung wandert),
                // deshalb nichts persistieren.
                logger.Info("mini moved (world): {0:0.00}/{1:0.00}/{2:0.00}",
                    _miniWorldPos.X, _miniWorldPos.Y, _miniWorldPos.Z);
                return;
            }
            else
            {
                json = "{\"type\":\"config\"" +
                    ",\"wristOffX\":" + _wristOffX.ToString(ci) +
                    ",\"wristOffY\":" + _wristOffY.ToString(ci) +
                    ",\"wristOffZ\":" + _wristOffZ.ToString(ci) + "}";
                logger.Info("wrist mini moved: X={0} Y={1} Z={2} cm", _wristOffX, _wristOffY, _wristOffZ);
            }
            OverlayClient.SendMessage(new OverlayMessage
            {
                Type = OverlayMessageType.ChatAction,
                Data = json
            });
        }

        /// Verschobene Position des kopffesten Panels im Mod speichern (cm).
        private void PersistHudOffset()
        {
            var ci = System.Globalization.CultureInfo.InvariantCulture;
            var json = "{\"type\":\"config\"" +
                ",\"hudOffX\":" + (_hudOffset.X * 100f).ToString("0.#", ci) +
                ",\"hudOffY\":" + (_hudOffset.Y * 100f).ToString("0.#", ci) +
                ",\"hudOffZ\":" + (_hudOffset.Z * 100f).ToString("0.#", ci) + "}";
            OverlayClient.SendMessage(new OverlayMessage
            {
                Type = OverlayMessageType.ChatAction,
                Data = json
            });
        }

        /// Platzieren: Panel folgt dem Controller-Laser (1 m Distanz, Billboard
        /// zum HMD); Trigger fixiert an der aktuellen Position (world mode).
        private bool _placeTriggerDown;

        private void ProcessPlacement(CVRSystem system, CVROverlay overlay)
        {
            var poses = new TrackedDevicePose_t[OpenVR.k_unMaxTrackedDeviceCount];
            system.GetDeviceToAbsoluteTrackingPose(ETrackingUniverseOrigin.TrackingUniverseStanding, 0, poses);
            var hmd = poses[OpenVR.k_unTrackedDeviceIndex_Hmd];
            var state = new VRControllerState_t();
            var wantRole = _placeHand == "left"
                ? ETrackedControllerRole.LeftHand
                : ETrackedControllerRole.RightHand;

            for (var i = 0u; i < OpenVR.k_unMaxTrackedDeviceCount; ++i)
            {
                var role = system.GetControllerRoleForTrackedDeviceIndex(i);
                if (role != ETrackedControllerRole.LeftHand && role != ETrackedControllerRole.RightHand)
                    continue;
                if (!poses[i].bPoseIsValid)
                    continue;
                // Draggen: die Hand, die den Drag gestartet hat; Platzieren:
                // konfigurierte Hand (Default rechts).
                if (_dragging && i != _dragIdx)
                    continue;
                if (!_dragging && role != wantRole)
                    continue;

                var m = poses[i].mDeviceToAbsoluteTracking;
                var src = LaserSource(m, role == ETrackedControllerRole.LeftHand);
                var dir = LaserDirection(m, role == ETrackedControllerRole.LeftHand);
                // Drag: Griffpunkt beibehalten; Platzieren: 1 m vor dem Laser
                var pos = _dragging
                    ? src + dir * _dragDist + _dragOffset
                    : src + dir * 1.0f;

                var hmdPos = hmd.bPoseIsValid
                    ? new Vector3(hmd.mDeviceToAbsoluteTracking.m3, hmd.mDeviceToAbsoluteTracking.m7,
                        hmd.mDeviceToAbsoluteTracking.m11)
                    : src;
                _lastPanelPos = pos;
                var z = Vector3.Normalize(hmdPos - pos);
                var x = Vector3.Normalize(Vector3.Cross(new Vector3(0, 1, 0), z));
                if (float.IsNaN(x.X)) x = new Vector3(1, 0, 0);
                var y = Vector3.Cross(z, x);
                var tm = new Matrix4x4(
                    x.X, x.Y, x.Z, 0,
                    y.X, y.Y, y.Z, 0,
                    z.X, z.Y, z.Z, 0,
                    pos.X, pos.Y, pos.Z, 1);
                var hm34 = ToHmdMatrix34(tm);
                overlay.SetOverlayWidthInMeters(_handle, _widthMeters);
                overlay.SetOverlayTransformAbsolute(_handle,
                    ETrackingUniverseOrigin.TrackingUniverseStanding, ref hm34);

                if (system.GetControllerState(i, ref state, (uint)Marshal.SizeOf(state)))
                {
                    var trigger = (state.ulButtonPressed & (1UL << (int)EVRButtonId.k_EButton_SteamVR_Trigger)) != 0;
                    if (_dragging)
                    {
                        // Drag endet beim Loslassen des Triggers
                        if (!trigger)
                        {
                            _dragging = false;
                            _placeRequested = true;
                            if (_bigMode == "world")
                            {
                                _worldPlaced = true; // _lastPanelPos steht schon
                                logger.Info("chat panel dragged (world)");
                            }
                            else
                            {
                                // Kopffest: das Panel bleibt kopffest, es
                                // wandert nur sein HMD-lokaler Offset mit.
                                if (hmd.bPoseIsValid &&
                                    Matrix4x4.Invert(ToMatrix4x4(hmd.mDeviceToAbsoluteTracking), out var invHmd))
                                {
                                    var local = Vector3.Transform(_lastPanelPos, invHmd);
                                    _hudOffset = new Vector3(
                                        Math.Clamp(local.X, -1.5f, 1.5f),
                                        Math.Clamp(local.Y, -1.5f, 1.5f),
                                        Math.Clamp(local.Z, -3f, -0.1f));
                                    PersistHudOffset();
                                }
                                logger.Info("chat panel dragged (hud offset {0:0.00}/{1:0.00}/{2:0.00} m)",
                                    _hudOffset.X, _hudOffset.Y, _hudOffset.Z);
                            }
                        }
                    }
                    else if (trigger && !_placeTriggerDown)
                    {
                        // Platzieren: Trigger fixiert (schaltet aufs freie
                        // Weltpanel um — der Mini bleibt davon unberührt)
                        _placing = false;
                        _bigMode = "world";
                        _worldPlaced = true;
                        _big = true;
                        _placeRequested = true;
                        _browser?.ExecuteScriptAsync(
                            "window.$vrchat && $vrchat.config", "{\"bigMode\":\"world\",\"placing\":false}");
                        OverlayClient.SendMessage(new OverlayMessage
                        {
                            Type = OverlayMessageType.ChatAction,
                            Data = "{\"type\":\"config\",\"bigMode\":\"world\"}"
                        });
                        logger.Info("chat panel placed (world)");
                    }
                    _placeTriggerDown = trigger;
                }
                return; // gewählte Hand führt
            }
        }

        /// Aktuelle Panel-Position in Welt-Koordinaten (für den Drag-Griffpunkt).
        private Vector3 CurrentPanelPos(CVRSystem system)
        {
            if (_bigMode == "world")
                return _lastPanelPos;
            // hud (Groß): head-locked Offset in Welt umrechnen
            var poses = new TrackedDevicePose_t[OpenVR.k_unTrackedDeviceIndex_Hmd + 1];
            system.GetDeviceToAbsoluteTrackingPose(ETrackingUniverseOrigin.TrackingUniverseStanding, 0, poses);
            var hmd = poses[OpenVR.k_unTrackedDeviceIndex_Hmd];
            if (!hmd.bPoseIsValid)
                return _lastPanelPos;
            var hm = ToMatrix4x4(hmd.mDeviceToAbsoluteTracking);
            var world = Matrix4x4.CreateTranslation(_hudOffset) * hm;
            return new Vector3(world.M41, world.M42, world.M43);
        }

        /// Buzz auf gewünschter Hand (left/right/both), ~10 Frames.
        private void ProcessHaptics(CVRSystem system)
        {
            if (_hapticPulses <= 0)
                return;
            _hapticPulses--;
            for (var i = 0u; i < OpenVR.k_unMaxTrackedDeviceCount; ++i)
            {
                var role = system.GetControllerRoleForTrackedDeviceIndex(i);
                var isLeft = role == ETrackedControllerRole.LeftHand;
                var isRight = role == ETrackedControllerRole.RightHand;
                if (!isLeft && !isRight)
                    continue;
                if (_hapticHand == "left" && !isLeft) continue;
                if (_hapticHand == "right" && !isRight) continue;
                system.TriggerHapticPulse(i, 0, 3000);
            }
        }

        private void ApplyTransform(CVRSystem system, CVROverlay overlay)
        {
            overlay.SetOverlayWidthInMeters(_handle, _widthMeters);
            if (_bigMode == "world")
            {
                // Frei in der Welt: einmal an der abgelegten Position
                // ausrichten (Billboard zum HMD), danach bleibt es stehen.
                var poses = new TrackedDevicePose_t[OpenVR.k_unMaxTrackedDeviceCount];
                system.GetDeviceToAbsoluteTrackingPose(ETrackingUniverseOrigin.TrackingUniverseStanding, 0, poses);
                var hmdPose = poses[OpenVR.k_unTrackedDeviceIndex_Hmd];
                if (!hmdPose.bPoseIsValid)
                    return;
                var hmd = ToMatrix4x4(hmdPose.mDeviceToAbsoluteTracking);
                if (!_worldPlaced)
                {
                    // Noch nie platziert: vor dem Kopf einblenden
                    var m0 = Matrix4x4.CreateTranslation(0f, -0.1f, -0.9f) * hmd;
                    _lastPanelPos = new Vector3(m0.M41, m0.M42, m0.M43);
                    _worldPlaced = true;
                }
                var bhm34 = ToHmdMatrix34(
                    Billboard(_lastPanelPos, new Vector3(hmd.M41, hmd.M42, hmd.M43)));
                overlay.SetOverlayTransformAbsolute(_handle,
                    ETrackingUniverseOrigin.TrackingUniverseStanding, ref bhm34);
            }
            else // hud: kopffest, Position per Dragbar verschiebbar
            {
                var m = Matrix4x4.CreateTranslation(_hudOffset);
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
                    case EVREventType.VREvent_KeyboardClosed:
                    case EVREventType.VREvent_KeyboardCharInput:
                        OnKeyboardEvent(type, e.data.keyboard.cNewInput);
                        break;
                }
            }
        }

        // ------------------------------------------------------------ laser --
        private readonly bool[] _triggerDown = new bool[2];
        private bool _pointerWasOnPanel;

        /// Ray-Ursprung = Controller-Pose. Die Kalibrierung sitzt bewusst NICHT
        /// hier: ein cm-Versatz der Quelle erzeugt einen distanzabhängigen
        /// Bildversatz (Parallaxe) und "wandert" damit über die Panelfläche.
        /// Korrigiert wird stattdessen die Richtung (Pitch/Yaw in Grad).
        private static Vector3 LaserSource(HmdMatrix34_t m, bool isLeft)
        {
            return new Vector3(m.m3, m.m7, m.m11);
        }

        /// SteamVR-Tastatur-Events — aus Overlay- UND System-Queue (VRCXVRCef,
        /// markierte Stelle), da SteamVR sie je nach Version unterschiedlich
        /// zustellt. CharInput streamt live in die Chatbox; Done/Closed
        /// übernimmt den kompletten Text.
        public void OnKeyboardEvent(EVREventType type, string chars = "")
        {
            if (type == EVREventType.VREvent_KeyboardCharInput)
            {
                var t = (chars ?? string.Empty).TrimEnd('\0');
                var zero = t.IndexOf('\0');
                if (zero >= 0) t = t.Substring(0, zero);
                logger.Info("keyboard char input: {0} chars", t.Length);
                if (t.Length > 0)
                    _browser?.ExecuteScriptAsync("window.$vrchat && $vrchat.keyboardChar", t);
                return;
            }
            if (type != EVREventType.VREvent_KeyboardDone &&
                type != EVREventType.VREvent_KeyboardClosed)
                return;
            var sb = new StringBuilder(1024);
            OpenVR.Overlay?.GetKeyboardText(sb, 1024);
            // GetKeyboardText liefert bei der Minimal-Tastatur regelmäßig nur
            // ein '\0' zurück (Länge 1). Ungefiltert hat das den kompletten
            // Entwurf durch ein unsichtbares Steuerzeichen ersetzt — deshalb
            // hier hart auf druckbaren Text reduzieren und sonst nichts senden.
            var text = sb.ToString();
            var nul = text.IndexOf('\0');
            if (nul >= 0)
                text = text.Substring(0, nul);
            text = new string(Array.FindAll(text.ToCharArray(), ch => ch >= ' '));
            logger.Info("keyboard event {0}, raw len {1}, nutzbar {2}", type, sb.Length, text.Length);
            if (text.Length > 0)
                _browser?.ExecuteScriptAsync("window.$vrchat && $vrchat.keyboardDone", text);
        }

        /// Ray-Richtung mit einstellbarer Neigung UND Seitwärtsdrehung
        /// (Index-Controller: rohe Pose zeigt nicht zur Spitze — Standard ~45°
        /// nach unten). Yaw ist je Hand gespiegelt (+ = nach außen), damit die
        /// Kalibrierung für beide Controller gilt.
        /// dir_local = RotY(yaw) * (0, -sin p, -cos p)
        ///           = (-cos p * sin y, -sin p, -cos p * cos y)
        private Vector3 LaserDirection(HmdMatrix34_t m, bool isLeft)
        {
            var p = _laserPitchDeg * (float)(Math.PI / 180f);
            var y = (isLeft ? -1f : 1f) * _laserYawDeg * (float)(Math.PI / 180f);
            var sp = (float)Math.Sin(p);
            var cp = (float)Math.Cos(p);
            var lx = -cp * (float)Math.Sin(y);
            var ly = -sp;
            var lz = -cp * (float)Math.Cos(y);
            // Controller-Space -> Welt (Spalten der Pose: x=m0/m4/m8, y=m1/m5/m9, z=m2/m6/m10)
            return Vector3.Normalize(new Vector3(
                lx * m.m0 + ly * m.m1 + lz * m.m2,
                lx * m.m4 + ly * m.m5 + lz * m.m6,
                lx * m.m8 + ly * m.m9 + lz * m.m10));
        }

        private void ProcessLaser(CVRSystem system, CVROverlay overlay)
        {
            if (!_visible || _placing)
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
                var dir = LaserDirection(m, role == ETrackedControllerRole.LeftHand);
                var src = LaserSource(m, role == ETrackedControllerRole.LeftHand);
                var parms = new VROverlayIntersectionParams_t
                {
                    eOrigin = ETrackingUniverseOrigin.TrackingUniverseStanding,
                    vSource = new HmdVector3_t { v0 = src.X, v1 = src.Y, v2 = src.Z },
                    vDirection = new HmdVector3_t { v0 = dir.X, v1 = dir.Y, v2 = dir.Z }
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

            // Während Mini-Press/Verschieben keine Klicks injizieren
            if (_miniPressActive || _wristMoving)
                return;

            var trigger = (state.ulButtonPressed & (1UL << (int)EVRButtonId.k_EButton_SteamVR_Trigger)) != 0;
            if (trigger && !_triggerDown[bestHand])
            {
                // Mini: kurzer Klick öffnet, Langdruck (400 ms) verschiebt —
                // in allen drei Modi (Handgelenk, kopffest, frei).
                if (!_big && !_wristLock)
                {
                    _miniPressActive = true;
                    _miniPressStartMs = NowMs();
                    _miniPressIdx = bestIdx;
                    _miniPressHand = bestHand;
                    _miniPressX = x;
                    _miniPressY = y;
                    _triggerDown[bestHand] = true;
                    return;
                }

                // Dragbar (unterer Panel-Streifen, nur Groß): Trigger startet Drag.
                // Griffpunkt merken, damit das Panel nicht zur Mitte springt.
                if (_big && !_dragLock && y > PANEL_SIZE - 70)
                {
                    var pm = poses[bestIdx].mDeviceToAbsoluteTracking;
                    var psrc = LaserSource(pm, bestHand == 0);
                    var pdir = LaserDirection(pm, bestHand == 0);
                    var panelPos = CurrentPanelPos(system);
                    _dragDist = Math.Clamp(Vector3.Distance(psrc, panelPos), 0.35f, 3f);
                    _dragOffset = panelPos - (psrc + pdir * _dragDist);
                    _dragging = true;
                    _dragIdx = bestIdx;
                    _placeTriggerDown = true;
                    _triggerDown[bestHand] = true;
                    return;
                }
                host.SendMouseClickEvent(x, y, MouseButtonType.Left, false, 1, CefEventFlags.None);
            }
            else if (!trigger && _triggerDown[bestHand])
                host.SendMouseClickEvent(x, y, MouseButtonType.Left, true, 1, CefEventFlags.None);
            _triggerDown[bestHand] = trigger;

            // joystick/touchpad Y scrollt die Nachrichtenliste
            var ay = state.rAxis0.y;
            if (Math.Abs(ay) > 0.4f)
                host.SendMouseWheelEvent(x, y, 0, (int)(ay * 40), CefEventFlags.None);
        }

        /// Geste: konfigurierbare Taste, Hand, Haltezeit und Auslöseart.
        /// Grip auf beiden Händen ist im Spiel eine Alltagsbewegung — deshalb
        /// muss sich das umbelegen lassen. Der Lernmodus übernimmt einfach die
        /// nächste gedrückte Taste (der Trigger ist ausgenommen, er bedient
        /// das Panel).
        private void ProcessGesture(CVRSystem system)
        {
            var now = NowMs();
            var state = new VRControllerState_t();
            for (var i = 0u; i < OpenVR.k_unMaxTrackedDeviceCount; ++i)
            {
                var role = system.GetControllerRoleForTrackedDeviceIndex(i);
                var isLeft = role == ETrackedControllerRole.LeftHand;
                var isRight = role == ETrackedControllerRole.RightHand;
                if (!isLeft && !isRight)
                    continue;
                if (!system.GetControllerState(i, ref state, (uint)Marshal.SizeOf(state)))
                    continue;

                if (_learningGesture)
                {
                    var learned = state.ulButtonPressed & ~TRIGGER_MASK;
                    if (learned != 0)
                    {
                        // niedrigstes gesetztes Bit => genau eine Taste
                        _gestureMask = learned & (~learned + 1);
                        _learningGesture = false;
                        _lastGestureAt = now;
                        var msg = "{\"type\":\"config\",\"gestureMask\":" + _gestureMask + "}";
                        OverlayClient.SendMessage(new OverlayMessage
                        {
                            Type = OverlayMessageType.ChatAction,
                            Data = msg
                        });
                        _browser?.ExecuteScriptAsync(
                            "window.$vrchat && $vrchat.gestureLearned", _gestureMask.ToString());
                        logger.Info("gesture gelernt: Maske {0}", _gestureMask);
                    }
                    continue;
                }

                if (_gestureHand == "left" && !isLeft) continue;
                if (_gestureHand == "right" && !isRight) continue;
                if (now - _lastGestureAt < 1500)
                    continue;

                var idx = isLeft ? 0 : 1;
                var pressed = (state.ulButtonPressed & _gestureMask) != 0;
                if (pressed)
                {
                    if (_pressStart[idx] == 0)
                        _pressStart[idx] = now;
                    // Halten: sofort auslösen, sobald die Zeit voll ist
                    if (_gestureMode == "hold" && now - _pressStart[idx] >= _gestureHoldMs)
                    {
                        _pressStart[idx] = double.MaxValue / 2; // nur einmal je Druck
                        FireGesture(now);
                    }
                }
                else
                {
                    if (_gestureMode == "double" && _pressStart[idx] != 0)
                    {
                        // Doppeltipp: zweiter kurzer Druck innerhalb 400 ms
                        if (now - _pressStart[idx] < 300)
                        {
                            if (now - _lastTapAt[idx] < 400)
                            {
                                _lastTapAt[idx] = 0;
                                FireGesture(now);
                            }
                            else
                            {
                                _lastTapAt[idx] = now;
                            }
                        }
                    }
                    _pressStart[idx] = 0;
                }
            }
        }

        private void FireGesture(double now)
        {
            _lastGestureAt = now;
            _browser?.ExecuteScriptAsync("window.$vrchat && $vrchat.gestureToggle()");
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
