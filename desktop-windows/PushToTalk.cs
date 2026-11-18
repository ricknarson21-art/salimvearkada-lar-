using System;
using System.Collections.Generic;

namespace BirArtiBir.Desktop;

internal sealed class PushToTalk
{
    private static readonly Dictionary<string, int> SpecialKeys = new()
    {
        ["Space"] = 0x20, ["Tab"] = 0x09, ["Backspace"] = 0x08,
        ["Enter"] = 0x0D, ["Escape"] = 0x1B,
        ["CapsLock"] = 0x14, ["PageUp"] = 0x21, ["PageDown"] = 0x22,
        ["End"] = 0x23, ["Home"] = 0x24, ["ArrowLeft"] = 0x25,
        ["ArrowUp"] = 0x26, ["ArrowRight"] = 0x27, ["ArrowDown"] = 0x28,
        ["Insert"] = 0x2D, ["Delete"] = 0x2E
    };

    private readonly Action<string, bool> send;
    private string? code;
    private int virtualKey;
    private bool armed;
    private bool transmittedDown;
    internal int VirtualKey => virtualKey;

    internal PushToTalk(Action<string, bool> send) => this.send = send;

    internal void Configure(string? nextCode)
    {
        if (nextCode == code) return;
        Suspend();
        virtualKey = ToVirtualKey(nextCode);
        code = virtualKey == 0 ? null : nextCode;
    }

    internal void Sample(bool inBackground, bool keyDown)
    {
        if (!inBackground || code == null)
        {
            Suspend();
            return;
        }

        if (!keyDown) armed = true;
        if (!armed || transmittedDown == keyDown) return;
        transmittedDown = keyDown;
        send(code, keyDown);
    }

    internal void Suspend()
    {
        armed = false;
        if (!transmittedDown || code == null) return;
        transmittedDown = false;
        send(code, false);
    }

    internal static int ToVirtualKey(string? code)
    {
        if (code == null) return 0;
        if (SpecialKeys.TryGetValue(code, out var special)) return special;
        if (code.Length == 4 && code.StartsWith("Key", StringComparison.Ordinal)
            && code[3] >= 'A' && code[3] <= 'Z') return code[3];
        if (code.Length == 6 && code.StartsWith("Digit", StringComparison.Ordinal)
            && code[5] >= '0' && code[5] <= '9') return code[5];
        if (code.Length is 2 or 3 && code[0] == 'F'
            && int.TryParse(code.Substring(1), out var function) && function is >= 1 and <= 24)
            return 0x6F + function;
        return 0;
    }
}
