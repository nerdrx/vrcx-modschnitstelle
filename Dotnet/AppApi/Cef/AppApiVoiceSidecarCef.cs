// MOD-API: Voice-Sidecar Prozessverwaltung (P4-Integration).
// Startet/stoppt den lokalen Voice-Sidecar (STT/TTS/Translator) aus dem Mod
// heraus. Der Pfad kommt aus den Mod-Einstellungen — hier ist bewusst nichts
// hardcodiert. Additive Datei, kein Upstream-Code berührt.
using System;
using System.Diagnostics;
using System.IO;

namespace VRCX
{
    public partial class AppApiCef
    {
        private static Process _voiceSidecarProc;
        private static readonly object _voiceSidecarLock = new object();

        /// <summary>
        /// Startet den Sidecar über start.cmd im angegebenen Ordner.
        /// Rückgabe: "ok", "already-running" oder eine Fehlermeldung.
        /// </summary>
        public string StartVoiceSidecar(string sidecarDir)
        {
            lock (_voiceSidecarLock)
            {
                if (IsVoiceSidecarRunning())
                    return "already-running";
                try
                {
                    if (string.IsNullOrWhiteSpace(sidecarDir) || !Directory.Exists(sidecarDir))
                        return "error: Ordner nicht gefunden";
                    var script = Path.Combine(sidecarDir, "start.cmd");
                    if (!File.Exists(script))
                        return "error: start.cmd nicht gefunden";
                    var psi = new ProcessStartInfo
                    {
                        FileName = "cmd.exe",
                        Arguments = "/c \"" + script + "\"",
                        WorkingDirectory = sidecarDir,
                        UseShellExecute = false,
                        CreateNoWindow = true,
                        WindowStyle = ProcessWindowStyle.Hidden
                    };
                    _voiceSidecarProc = Process.Start(psi);
                    AppDomain.CurrentDomain.ProcessExit -= OnExitStopVoiceSidecar;
                    AppDomain.CurrentDomain.ProcessExit += OnExitStopVoiceSidecar;
                    return "ok";
                }
                catch (Exception ex)
                {
                    return "error: " + ex.Message;
                }
            }
        }

        public void StopVoiceSidecar()
        {
            lock (_voiceSidecarLock)
            {
                try
                {
                    if (_voiceSidecarProc != null && !_voiceSidecarProc.HasExited)
                    {
                        // Prozessbaum beenden: start.cmd spawnt python im venv
                        var kill = new ProcessStartInfo
                        {
                            FileName = "taskkill",
                            Arguments = "/pid " + _voiceSidecarProc.Id + " /t /f",
                            UseShellExecute = false,
                            CreateNoWindow = true
                        };
                        Process.Start(kill)?.WaitForExit(3000);
                    }
                }
                catch { }
                _voiceSidecarProc = null;
            }
        }

        public bool IsVoiceSidecarRunning()
        {
            try
            {
                return _voiceSidecarProc != null && !_voiceSidecarProc.HasExited;
            }
            catch
            {
                return false;
            }
        }

        private static void OnExitStopVoiceSidecar(object sender, EventArgs e)
        {
            try
            {
                if (_voiceSidecarProc != null && !_voiceSidecarProc.HasExited)
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = "taskkill",
                        Arguments = "/pid " + _voiceSidecarProc.Id + " /t /f",
                        UseShellExecute = false,
                        CreateNoWindow = true
                    });
            }
            catch { }
        }
    }
}
