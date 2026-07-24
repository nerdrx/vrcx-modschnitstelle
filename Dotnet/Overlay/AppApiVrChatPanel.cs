// MOD-API: P2 VR chat panel — additive partial extension of AppApiVr.
// Bound in every overlay browser; vr-chat.html calls this to send chat
// actions (send/read/typing/config) and to request the SteamVR keyboard.
namespace VRCX;

public abstract partial class AppApiVr
{
    public virtual void ChatPanelAction(string json)
    {
        VRCXVRChatPanel.Instance?.PanelAction(json);
    }
}
