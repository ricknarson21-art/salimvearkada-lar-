using System;
using System.Drawing;
using System.Windows.Forms;

namespace BirArtiBir.Desktop;

public sealed class OverlaySnapshot
{
    public string Room { get; set; } = "";
    public OverlayMember[] People { get; set; } = Array.Empty<OverlayMember>();
    public int Count { get; set; }
}

public sealed class OverlayMember
{
    public string Name { get; set; } = "";
    public string State { get; set; } = "";
}

internal sealed class VoiceOverlay : Form
{
    private const int PanelWidth = 250;
    private const int RowHeight = 24;
    private const int HeaderHeight = 34;
    private OverlaySnapshot? snapshot;
    private readonly Font heading = new("Segoe UI", 10, FontStyle.Bold);
    private readonly Font body = new("Segoe UI", 9);
    private readonly Font badge = new("Segoe UI", 8, FontStyle.Bold);

    internal VoiceOverlay()
    {
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        ShowInTaskbar = false;
        TopMost = true;
        Opacity = 0.94;
        BackColor = Color.FromArgb(18, 25, 39);
        DoubleBuffered = true;
    }

    protected override bool ShowWithoutActivation => true;

    protected override CreateParams CreateParams
    {
        get
        {
            var parameters = base.CreateParams;
            // A layered, transparent tool window lets clicks pass directly to the game.
            parameters.ExStyle |= 0x00080000 | 0x00000020 | 0x08000000 | 0x00000080;
            return parameters;
        }
    }

    protected override void WndProc(ref Message message)
    {
        if (message.Msg == 0x0084)
        {
            message.Result = new IntPtr(-1);
            return;
        }
        base.WndProc(ref message);
    }

    internal void SetSnapshot(OverlaySnapshot value)
    {
        snapshot = value;
        var footer = value.Count > value.People.Length ? RowHeight : 0;
        ClientSize = new Size(PanelWidth, HeaderHeight + value.People.Length * RowHeight + footer + 6);
        Invalidate();
    }

    internal void ShowOn(Rectangle foreground, Rectangle screen)
    {
        var left = Math.Max(screen.Left, foreground.Left) + 12;
        var top = Math.Max(screen.Top, foreground.Top) + 12;
        var position = new Point(Math.Min(left, screen.Right - Width - 12),
            Math.Min(top, screen.Bottom - Height - 12));
        if (Location != position) Location = position;
        if (!Visible) Show();
    }

    protected override void OnPaint(PaintEventArgs args)
    {
        base.OnPaint(args);
        if (snapshot == null) return;
        var g = args.Graphics;
        using var line = new Pen(Color.FromArgb(52, 66, 94));
        g.DrawRectangle(line, 0, 0, Width - 1, Height - 1);
        g.DrawLine(line, 0, HeaderHeight - 2, Width, HeaderHeight - 2);
        Draw(g, $"{snapshot.Room} · {snapshot.Count} kişi", heading, 11, 0, Width - 22, HeaderHeight,
            Color.FromArgb(216, 230, 255));
        for (var index = 0; index < snapshot.People.Length; index++)
        {
            var member = snapshot.People[index];
            var y = HeaderHeight + index * RowHeight;
            var (status, color) = member.State switch
            {
                "speaking" => ("Konuşuyor", Color.FromArgb(119, 239, 174)),
                "muted" => ("Mikrofon kapalı", Color.FromArgb(255, 170, 174)),
                "music" => ("Müzik", Color.FromArgb(178, 195, 255)),
                _ => ("Mikrofon açık", Color.FromArgb(169, 183, 205))
            };
            using var dot = new SolidBrush(color);
            g.FillEllipse(dot, 11, y + 9, 7, 7);
            Draw(g, member.Name, body, 24, y, 119, RowHeight, Color.White);
            Draw(g, status, badge, 148, y, 95, RowHeight, color);
        }
        if (snapshot.Count > snapshot.People.Length)
            Draw(g, $"+{snapshot.Count - snapshot.People.Length} kişi", body, 24,
                HeaderHeight + snapshot.People.Length * RowHeight, 180, RowHeight, Color.LightGray);
    }

    private static void Draw(Graphics g, string text, Font font, int x, int y, int width, int height, Color color)
    {
        TextRenderer.DrawText(g, text, font, new Rectangle(x, y, width, height), color,
            TextFormatFlags.EndEllipsis | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPrefix |
            TextFormatFlags.SingleLine | TextFormatFlags.NoPadding);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            heading.Dispose();
            body.Dispose();
            badge.Dispose();
        }
        base.Dispose(disposing);
    }
}
