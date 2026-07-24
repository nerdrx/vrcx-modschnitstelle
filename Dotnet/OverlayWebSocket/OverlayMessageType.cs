namespace VRCX;

public enum OverlayMessageType
{
    OverlayConnected,
    JsFunctionCall,
    UpdateVars,
    IsHmdAfk,
    ChatAction // MOD-API: P2 VR chat panel -> main renderer (send/read/typing/config)
}
