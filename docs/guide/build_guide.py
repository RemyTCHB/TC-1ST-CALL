"""Builds the branded TC Checklist user guide (PDF) for the team.

    python3 docs/guide/build_guide.py      ->  docs/guide/TC_Checklist_User_Guide.pdf

Same look and building blocks as the Title Commitment Agent's guide. Screenshots in docs/guide/shots/ come from the app
on the local Firebase emulators with made-up sample properties and people, never real ones:
    cd tests && node run.mjs guide-shots.mjs
Fonts: Baloo 2 and Nunito Sans (SIL Open Font License), the same as the app. Needs reportlab and Pillow.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    CondPageBreak,
    Frame,
    Image,
    KeepTogether,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SHOTS = HERE / "shots"
CROPS = HERE / ".crops"  # cropped copies of the screenshots, rebuilt each time (gitignored)
OUT = HERE / "TC_Checklist_User_Guide.pdf"
LOGO = ROOT / "logo-light.png"
APP = "TC Checklist"

# brand (the hub tokens in index.html)
INDIGO, RED, GREEN = colors.HexColor("#4D458A"), colors.HexColor("#BD2239"), colors.HexColor("#109648")
INK, BODY, MUTED = colors.HexColor("#211E33"), colors.HexColor("#47445A"), colors.HexColor("#767388")
LAV, ACCENT_SOFT, LINE = colors.HexColor("#F2F1F9"), colors.HexColor("#EAE9F4"), colors.HexColor("#DDDBEA")
WARN_BG, WARN = colors.HexColor("#FFF3D1"), colors.HexColor("#8A5A00")
BAD_BG, GOOD_BG, ORANGE = colors.HexColor("#FBF0F2"), colors.HexColor("#EAF7EF"), colors.HexColor("#B45309")
ORANGE_BG = colors.HexColor("#FFF1E0")

PAGE_W, PAGE_H = letter
MARGIN = 0.75 * inch
WIDTH = PAGE_W - 2 * MARGIN


def fonts() -> None:
    f = HERE / "fonts"
    for name, file in (("Baloo", "Baloo2-700.ttf"), ("Baloo-Semi", "Baloo2-600.ttf"), ("Nunito", "NunitoSans-400.ttf"),
                       ("Nunito-Semi", "NunitoSans-600.ttf"), ("Nunito-Bold", "NunitoSans-700.ttf"),
                       ("Nunito-Italic", "NunitoSans-400i.ttf"), ("Nunito-Black", "NunitoSans-800.ttf")):
        pdfmetrics.registerFont(TTFont(name, str(f / file)))
    pdfmetrics.registerFont(TTFont("DejaVu", str(f / "DejaVuSans.ttf")))  # ✓ ✗ ★ →, missing from the brand fonts
    pdfmetrics.registerFontFamily("Nunito", normal="Nunito", bold="Nunito-Bold", italic="Nunito-Italic",
                                  boldItalic="Nunito-Bold")


fonts()
S = {
    "h1": ParagraphStyle("h1", fontName="Baloo", fontSize=22, leading=26, textColor=INDIGO, spaceAfter=4),
    "h2": ParagraphStyle("h2", fontName="Baloo", fontSize=14.5, leading=18, textColor=INDIGO, spaceBefore=10,
                         spaceAfter=3, keepWithNext=1),
    "lead": ParagraphStyle("lead", fontName="Nunito", fontSize=11, leading=16, textColor=BODY, spaceAfter=8),
    "p": ParagraphStyle("p", fontName="Nunito", fontSize=10, leading=14.5, textColor=BODY, spaceAfter=6),
    "small": ParagraphStyle("small", fontName="Nunito", fontSize=8.5, leading=11.5, textColor=MUTED),
    "cap": ParagraphStyle("cap", fontName="Nunito-Italic", fontSize=8.5, leading=11, textColor=MUTED,
                          alignment=TA_CENTER, spaceBefore=3, spaceAfter=10),
    "cell": ParagraphStyle("cell", fontName="Nunito", fontSize=9, leading=12, textColor=BODY),
    "cellb": ParagraphStyle("cellb", fontName="Nunito-Bold", fontSize=9, leading=12, textColor=INK),
    "th": ParagraphStyle("th", fontName="Nunito-Bold", fontSize=9, leading=12, textColor=colors.white),
    "step": ParagraphStyle("step", fontName="Nunito", fontSize=10, leading=14.5, textColor=BODY),
    "toc": ParagraphStyle("toc", fontName="Nunito-Semi", fontSize=11, leading=20, textColor=INK),
}


# ---------------------------------------------------------------- building blocks
SYMBOLS = "✓✗★→"


def Para(text: str, style: ParagraphStyle, **kw) -> Paragraph:
    for ch in SYMBOLS:
        text = text.replace(ch, f'<font name="DejaVu">{ch}</font>')
    return Paragraph(text, style, **kw)


def P(text: str, style: str = "p") -> Paragraph:
    return Para(text, S[style])


def section(n: int, title: str, lead: str = "", need: float = 3.2) -> list:
    """need: inches the heading and what follows it need, or it starts on a new page."""
    badge = Table([[Para(f'<font name="Nunito-Black" color="white">{n}</font>',
                              ParagraphStyle("b", fontSize=11, leading=13, alignment=TA_CENTER))]],
                  colWidths=[0.32 * inch], rowHeights=[0.32 * inch])
    badge.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), RED), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                               ("ROUNDEDCORNERS", [5, 5, 5, 5]), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                               ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    head = Table([[badge, Para(title, S["h1"])]], colWidths=[0.45 * inch, WIDTH - 0.45 * inch])
    head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                              ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    head.keepWithNext = True
    out = [CondPageBreak(need * inch), head]
    if lead:
        intro = P(lead, "lead")
        intro.keepWithNext = True
        out.append(intro)
    return out


def steps(items: list[str]) -> Table:
    rows = []
    for i, t in enumerate(items, 1):
        num = Table([[Para(f'<font name="Nunito-Black" color="#4D458A">{i}</font>',
                                ParagraphStyle("n", fontSize=9.5, leading=11, alignment=TA_CENTER))]],
                    colWidths=[0.24 * inch], rowHeights=[0.24 * inch])
        num.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), ACCENT_SOFT), ("ROUNDEDCORNERS", [12, 12, 12, 12]),
                                 ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                 ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 0),
                                 ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
        rows.append([num, Para(t, S["step"])])
    t = Table(rows, colWidths=[0.38 * inch, WIDTH - 0.38 * inch])
    t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 5), ("TOPPADDING", (0, 0), (-1, -1), 1)]))
    return t


def bullets(items: list[str]) -> list:
    return [Para(t, ParagraphStyle("bl", parent=S["p"], leftIndent=12, bulletIndent=2, spaceAfter=3),
                      bulletText="•") for t in items]


def box(text: str, kind: str = "tip", title: str = "") -> Table:
    bg, edge, label = {"tip": (ACCENT_SOFT, INDIGO, "Tip"), "warn": (WARN_BG, WARN, "Important"),
                       "bad": (BAD_BG, RED, "Watch out"), "good": (GOOD_BG, GREEN, "Good to know")}[kind]
    content = Para(f'<font name="Nunito-Bold" color="{edge.hexval()}">{title or label}.</font> {text}', S["p"])
    t = Table([[content]], colWidths=[WIDTH])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), bg), ("ROUNDEDCORNERS", [8, 8, 8, 8]),
                           ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                           ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                           ("LINEBEFORE", (0, 0), (0, -1), 3, edge)]))
    return KeepTogether([Spacer(1, 3), t, Spacer(1, 7)])


def table(head: list[str], rows: list[list[str]], widths: list[float], first_bold: bool = True) -> Table:
    data = [[Para(h, S["th"]) for h in head]]
    for r in rows:
        data.append([Para(c, S["cellb"] if (i == 0 and first_bold) else S["cell"]) for i, c in enumerate(r)])
    t = Table(data, colWidths=[w * WIDTH for w in widths], repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), INDIGO), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LAV]),
                           ("LINEBELOW", (0, 1), (-1, -1), 0.4, LINE), ("ROUNDEDCORNERS", [8, 8, 8, 8]),
                           ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                           ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7)]))
    return KeepTogether([t, Spacer(1, 8)])


def shot(name: str, caption: str, width: float = 1.0, crop: tuple[float, float, float, float] | None = None,
         max_h: float = 4.6) -> KeepTogether:
    """A screenshot with a thin frame. crop = (left, top, right, bottom) as fractions of the image."""
    CROPS.mkdir(exist_ok=True)
    im = PILImage.open(SHOTS / f"{name}.jpg").convert("RGB")
    if crop:
        w, h = im.size
        im = im.crop((int(crop[0] * w), int(crop[1] * h), int(crop[2] * w), int(crop[3] * h)))
    if im.width > 1700:  # about 240 dpi across the page: sharp in print, light enough to email
        im = im.resize((1700, round(im.height * 1700 / im.width)), PILImage.LANCZOS)
    src = CROPS / f"{name}-{'-'.join(f'{c:.2f}' for c in (crop or (0, 0, 1, 1)))}.jpg"
    im.save(src, quality=82, optimize=True)
    pw, ph = im.size
    w = WIDTH * width
    h = w * ph / pw
    if h > max_h * inch:  # keep tall shots on one page
        h = max_h * inch
        w = h * pw / ph
    img = Image(str(src), width=w, height=h)
    frame = Table([[img]], colWidths=[w + 6])
    frame.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 0.6, LINE), ("ROUNDEDCORNERS", [6, 6, 6, 6]),
                               ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                               ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
    return KeepTogether([Spacer(1, 4), frame, P(caption, "cap")])


def pair(left: str, right: str, caption: str, height: float = 4.3) -> KeepTogether:
    """Two phone screenshots side by side."""
    cells = []
    for name in (left, right):
        w, h = PILImage.open(SHOTS / f"{name}.jpg").size
        cells.append(Image(str(SHOTS / f"{name}.jpg"), width=height * inch * w / h, height=height * inch))
    t = Table([cells], colWidths=[WIDTH / 2.6] * 2)
    t.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    return KeepTogether([Spacer(1, 4), t, P(caption, "cap")])


# ---------------------------------------------------------------- pages
def cover(c, doc) -> None:
    c.saveState()
    c.setFillColor(LAV)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    # soft brand glows, like the app's aurora background
    for x, y, r, col, alpha in ((0.05, 1.02, 4.2, INDIGO, 0.10), (1.0, 0.95, 3.4, RED, 0.06),
                                (0.6, -0.05, 3.8, GREEN, 0.05)):
        c.setFillColor(col, alpha=alpha)
        c.circle(x * PAGE_W, y * PAGE_H, r * inch, stroke=0, fill=1)
    c.setFillColor(INDIGO)
    c.rect(0, 0, PAGE_W, 1.15 * inch, stroke=0, fill=1)
    lw, lh = PILImage.open(LOGO).size
    c.drawImage(str(LOGO), MARGIN, PAGE_H - 2.55 * inch, width=3.6 * inch, height=3.6 * inch * lh / lw, mask="auto")
    c.setFillColor(INDIGO)
    c.setFont("Baloo", 40)
    c.drawString(MARGIN, PAGE_H - 4.1 * inch, "TC")
    c.setFillColor(RED)
    c.drawString(MARGIN + c.stringWidth("TC ", "Baloo", 40), PAGE_H - 4.1 * inch, "Checklist")
    c.setFont("Baloo-Semi", 22)
    c.setFillColor(INDIGO)
    c.drawString(MARGIN, PAGE_H - 4.7 * inch, "User Guide")
    c.setFont("Nunito", 13)
    c.setFillColor(BODY)
    y = PAGE_H - 5.3 * inch
    for line in ("How to run the seller's first call, keep every answer in one place,",
                 "and track each property from Open to Closed."):
        c.drawString(MARGIN, y, line)
        y -= 19
    c.setFont("Nunito-Bold", 11)
    c.setFillColor(INK)
    c.drawString(MARGIN, PAGE_H - 6.35 * inch, "For: Transaction Coordinators, Dispo and Managers")
    c.setFont("Nunito", 10)
    c.setFillColor(MUTED)
    c.drawString(MARGIN, PAGE_H - 6.62 * inch, f"Version 2.0 · {date.today():%B %Y} · tc.totalchb.com")
    c.setFillColor(colors.white)
    c.setFont("Nunito-Bold", 9.5)
    c.drawString(MARGIN, 0.62 * inch, "Total Cash Home Buyers · Internal use only")
    c.setFont("Nunito", 9)
    c.drawRightString(PAGE_W - MARGIN, 0.62 * inch, "Screens show made-up sample properties")
    c.restoreState()


def inner(c, doc) -> None:
    c.saveState()
    lw, lh = PILImage.open(LOGO).size
    c.drawImage(str(LOGO), MARGIN, PAGE_H - 0.62 * inch, width=1.2 * inch, height=1.2 * inch * lh / lw, mask="auto")
    c.setFont("Nunito-Semi", 8.5)
    c.setFillColor(MUTED)
    c.drawRightString(PAGE_W - MARGIN, PAGE_H - 0.5 * inch, f"{APP} · User Guide")
    c.setStrokeColor(LINE)
    c.setLineWidth(0.6)
    c.line(MARGIN, PAGE_H - 0.72 * inch, PAGE_W - MARGIN, PAGE_H - 0.72 * inch)
    c.line(MARGIN, 0.62 * inch, PAGE_W - MARGIN, 0.62 * inch)
    c.drawString(MARGIN, 0.42 * inch, "Total Cash Home Buyers · Internal use only")
    c.setFillColor(INDIGO)
    c.setFont("Nunito-Bold", 9)
    c.drawRightString(PAGE_W - MARGIN, 0.42 * inch, str(doc.page))
    c.restoreState()


SECTIONS = [
    f"What {APP} Does", "Signing In", "Finding Your Way Around", "The Properties Page", "Starting A New Property",
    "Working The First Call", "Saving And Working Together", "Closing Or Cancelling A Property",
    "Printing Or Saving A PDF", "Deleting A Property", "On A Phone", "Getting The Newest Version",
    "For Managers And The Owner", "Good Habits", "Quick Answers",
]


def cards3(cards: list[tuple[str, str]]) -> Table:
    cw = (WIDTH - 0.3 * inch) / 3
    row = []
    for title, text in cards:
        cell = Table([[Para(title, ParagraphStyle("ct", fontName="Baloo", fontSize=12.5, leading=15, textColor=INDIGO))],
                      [Para(text, S["cell"])]], colWidths=[cw - 0.1 * inch])
        cell.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
        row.append(cell)
    ct = Table([row], colWidths=[cw + 0.1 * inch] * 3)
    ct.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), LAV), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("LINEAFTER", (0, 0), (1, 0), 4, colors.white), ("ROUNDEDCORNERS", [8, 8, 8, 8]),
                            ("LEFTPADDING", (0, 0), (-1, -1), 10), ("TOPPADDING", (0, 0), (-1, -1), 9),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 9)]))
    return ct


def story() -> list:
    s: list = [NextPageTemplate("inner"), PageBreak()]

    # ---- contents
    s += [P("Contents", "h1"), Spacer(1, 6)]
    toc = [[Para(f'<font name="Baloo" color="#BD2239">{i}</font>', S["toc"]), Para(t, S["toc"])]
           for i, t in enumerate(SECTIONS, 1)]
    toc.append([Para('<font name="Baloo" color="#BD2239">★</font>', S["toc"]),
                Para("Quick Reference Card (last page)", S["toc"])])
    t = Table(toc, colWidths=[0.4 * inch, WIDTH - 0.4 * inch])
    t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE), ("TOPPADDING", (0, 0), (-1, -1), 3),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 3), ("LEFTPADDING", (0, 0), (-1, -1), 2)]))
    s += [t, Spacer(1, 14),
          box("Everyone: read sections 1–12 and keep the Quick Reference Card handy. Managers and the owner: also "
              "read section 13.", "tip", "Who reads what"),
          box("TC Checklist now looks and works like the Universal Team Hub. It opens on a <b>Properties</b> list "
              "with <b>Open / Closed / Cancelled</b> tabs and a search box; edits save as you type and appear live "
              "for everyone; a property can be marked <b>Closed</b> or <b>Cancelled</b>; <b>Print / PDF</b> shows "
              "every answer in full; and names come from the Team Hub. Every question, and every answer already "
              "saved, is exactly where it was.", "good", "What's new in version 2")]
    s.append(PageBreak())

    # ---- 1
    s += section(1, f"What {APP} Does",
                 "TC Checklist is the script for the seller's first call. It walks you through every question to ask, "
                 "keeps each answer with the property, and shares it live with the whole team.")
    s += [cards3([
        ("One list per property", "Mortgage, Pictures, Emergency Contact, HOA, SFHs, Land, Income Producing "
                                  "Properties and Mobile Homes: 79 questions, each with a check and an answer box."),
        ("Live for everyone", "Every check and answer saves as you type and shows on your teammates' screens at "
                              "once. Two people can work the same property without overwriting each other."),
        ("Open to Closed", "Every property starts Open. Mark it Closed or Cancelled when the deal ends; it moves to "
                           "its own tab and becomes view-only."),
    ]), Spacer(1, 10)]
    s += [P("What you get", "h2")]
    s += bullets([
        "<b>A Properties page</b> with every first call the team has started, searchable by address, CRM link or any "
        "answer.",
        "<b>For every property</b>: the CRM lead link, how many questions are checked, when it was last updated and "
        "by whom, and its status.",
        "<b>A printable record</b> of the call, with every answer in full.",
        "<b>An Eastern-time clock</b> from the server, so every time shown is the same for everyone.",
    ])
    s += [box("The checklist is a guide for the call, not a contract. Confirm anything important (payoffs, HOA "
              "approvals, zoning) with the source before it goes into a deal.", "warn")]

    # ---- 2
    s += section(2, "Signing In", "Only company Google accounts (@totalchb.com) can open it. There is no separate "
                                  "password.")
    s += [steps([
        "Go to <b>tc.totalchb.com</b> and bookmark it (or install it: section 11).",
        "Click <b>Sign In With Google</b> and pick your <b>@totalchb.com</b> account.",
        "You stay signed in on that browser.",
        "On a shared computer, click your initials at the top right, then <b>Sign Out</b>.",
    ]), shot("01-signin", "The sign-in screen. Nothing else is visible until you sign in.", 0.5,
             crop=(0.28, 0.24, 0.72, 0.76))]
    s += [box("A personal Gmail or any other account is turned away with \"Access Denied. @totalchb.com emails "
              "only.\" Sign in again with your company account.", "tip")]

    # ---- 3
    s += section(3, "Finding Your Way Around", need=4.5)
    s += [shot("02-home", "The header (top) and the Properties page.", 1.0, crop=(0, 0, 1, 0.33))]
    s += [table(["Where", "What it's for"], [
        ["Logo", "Click it from anywhere to go back to the Properties page."],
        ["Clock", "Eastern time from the server: the date with the 24-hour time on top, the date with AM / PM "
                  "beneath. It's the same on every device."],
        ["All Saved", "<b>Green</b>: every change is saved for the whole team. <b>Saving…</b> (purple): a change is "
                      "on its way. <b>Not Saved – Retry</b> (red): see section 7."],
        ["Active", "How many teammates are online now. Click it to see who, and whether they're on a phone or a "
                   "computer."],
        ["Sun / moon", "Light or dark look. It follows your device at first; your choice is remembered on that "
                       "browser."],
        ["Your initials", "Your name and email, and <b>Sign Out</b>."],
    ], [0.2, 0.8])]
    s += [shot("05-active", "Click Active to see who's online.", 0.5, crop=(0.6, 0.0, 0.98, 0.38)),
          shot("15-home-dark", "The dark look.", 1.0, crop=(0, 0, 1, 0.62))]

    # ---- 4
    s += section(4, "The Properties Page",
                 "Home. Every property the team has started, newest activity first.", need=7.5)
    s += [shot("02-home", "The Properties page: tabs, search, New Property and the property cards.", 1.0)]
    s += [table(["Part", "What it shows"], [
        ["Open / Closed / Cancelled", "The three lists. The number on each tab is how many properties it holds. "
                                      "Every property starts in Open."],
        ["The numbers at the top", "Open and Closed properties, and how far the Open ones are on average."],
        ["Search", "Type any part of an address, a CRM link or an answer. It searches the tab you're on and shows "
                   "where it matched."],
        ["A property card", "The address, its status, when it was last updated and by whom, a ring and a bar with "
                            "how many of the 79 questions are checked (green at 100%), and <b>Open In CRM</b>."],
    ], [0.27, 0.73])]
    s += [shot("03-search", "Searching for an HOA name finds the property and shows the answer it matched.", 1.0,
               crop=(0, 0.26, 1, 0.6))]
    s += [box("Click anywhere on a card to open its checklist. <b>Open In CRM</b> opens the lead in GoHighLevel in "
              "a new tab instead.", "tip")]

    # ---- 5
    s += section(5, "Starting A New Property", "Start one as soon as the first call is booked.")
    s += [steps([
        "On the Properties page, click <b>New Property</b>.",
        "Type the property address exactly as it should appear, for example <b>1420 Sample Palm Dr, Exampleton FL "
        "33000</b>.",
        "Click <b>Create</b>. The checklist opens, ready for the call.",
        "Paste the GoHighLevel lead into <b>CRM Lead Link</b> at the top.",
    ]), shot("07-new-property", "New Property: type the address once.", 0.72, crop=(0.3, 0.3, 0.7, 0.68))]
    s += [box("The address can't be changed after it's created, because it's how the property is saved. If you "
              "make a typo, create the property again with the right address and delete the wrong one "
              "(section 10).", "warn"),
          box("If the address already exists, <b>Create</b> simply opens it, so you never get two copies of the "
              "same property.", "good"),
          box("If you'd started a checklist before version 2 without typing an address, a yellow note on the "
              "Properties page offers <b>Start A Property With It</b>, which brings those answers into a new "
              "property.", "tip", "An old unsaved checklist")]

    # ---- 6
    s += section(6, "Working The First Call", need=5.0)
    s += [shot("08-checklist-top", "A property: its details at the top, then the sections.", 1.0)]
    s += [steps([
        "Work down the sections. Each one shows how many of its questions are checked (for example <b>6 / 7</b>), "
        "with a bar that fills as you go. A finished section turns green.",
        "Click a section's title to open or close it. <b>Expand All</b> and <b>Collapse All</b> are at the top.",
        "Tick the box when a question is covered. Clicking the question's text ticks it too.",
        "Type the seller's answer in the box under the question. It grows to fit long answers.",
        "Paste a link (photos, a statement, a listing) and an open-link button appears in the box.",
        "Under <b>What is The Monthly Escrow Payments</b>, put the <b>HOI</b> and <b>Taxes</b> amounts in their own "
        "boxes.",
    ]), shot("09-mortgage-section", "Mortgage Questions with answers, including the HOI and Taxes boxes.", 1.0,
             crop=(0, 0.1, 1, 0.98), max_h=4.4)]
    s += [box("<b>Mobile Homes</b>: treat it like an SFH with all those questions, then add the Mobile Homes "
              "ones.", "tip")]

    # ---- 7
    s += section(7, "Saving And Working Together",
                 "There is no Save button. Every check and answer saves on its own, a moment after you stop typing.")
    s += [table(["The badge says", "What it means"], [
        ["All Saved (green)", "Everything is saved for the whole team."],
        ["Saving…", "A change is on its way. If you're offline it waits and goes as soon as you're back."],
        ["Not Saved – Retry (red)", "The change didn't reach the server. It keeps trying on its own; click the badge "
                                    "to try straight away. Nothing you typed is thrown away."],
    ], [0.3, 0.7])]
    s += bullets([
        "<b>Teammates see your answers as you type</b>, and you see theirs, without reloading.",
        "<b>Two people on the same property</b>: each answer is saved on its own, so nobody overwrites anyone. The "
        "box you're typing in is never changed under you.",
        "<b>Leaving while it says Saving…</b>: the browser asks you to wait. Let it finish.",
    ])

    # ---- 8
    s += section(8, "Closing Or Cancelling A Property",
                 "When a deal closes or falls through, take it off the Open list.", need=5.0)
    s += [steps([
        "Open the property and click <b>Status: Open</b>.",
        "Pick <b>Mark Closed</b> or <b>Mark Cancelled</b>, then confirm.",
        "It moves to the Closed or Cancelled tab and becomes <b>view-only</b>: nobody can change it by accident.",
        "To work on it again, open it and click <b>Reopen</b>.",
    ]), shot("10-status-menu", "The Status menu.", 0.55, crop=(0.02, 0.44, 0.42, 0.78))]
    s += [shot("13-closed-view", "A Closed property: a green edge, a lock note and Reopen.", 1.0, crop=(0, 0.08, 1, 0.75)),
          shot("14-activity", "Activity: every status change, with who and when.", 0.55, crop=(0.13, 0.5, 0.47, 0.82))]

    # ---- 9
    s += section(9, "Printing Or Saving A PDF", "For the deal file, or to send to someone on the deal.")
    s += [steps([
        "Open the property and click <b>Print / PDF</b>.",
        "In the print window, pick your printer, or <b>Save as PDF</b> as the destination.",
    ])]
    s += bullets([
        "The top shows the address, CRM link, status, how many questions are checked, when it was last updated and "
        "when it was printed.",
        "<b>Every answer prints in full</b>, however long.",
        "Sections with nothing filled in are left out, to keep it short.",
    ])
    s += [shot("12-print", "The printed checklist.", 0.62, crop=(0, 0, 1, 0.62), max_h=4.6)]
    s += [box("The printout holds the seller's details. Keep it inside the company and only send it to people on "
              "the deal.", "warn")]

    # ---- 10
    s += section(10, "Deleting A Property")
    s += [P("Deleting removes the property and every answer for the whole team, for good. Most of the time, "
            "<b>Mark Cancelled</b> is the better choice: it's off the Open list but still there if you need it."),
          steps(["Open the property and click <b>Delete</b>.", "Type <b>DELETE</b> in the box.",
                 "Click <b>Delete</b>."]),
          shot("11-delete", "Deleting asks you to type DELETE first.", 0.7, crop=(0.3, 0.27, 0.7, 0.73))]

    # ---- 11
    s += section(11, "On A Phone", need=5.5)
    s += [P("Same link, same sign-in. The header stacks into three rows, buttons fill the width, and menus slide up "
            "from the bottom. Answer boxes use a larger text size so the phone doesn't zoom in."),
          pair("21-phone-home", "22-phone-checklist", "On a phone: the Properties page and a checklist.", 4.4)]
    s += [box("To put it on your home screen: in Safari tap Share → <b>Add to Home Screen</b>; in Chrome open the three-dot menu → "
              "<b>Install app</b> or <b>Add to Home screen</b>.", "tip")]

    # ---- 12
    s += section(12, "Getting The Newest Version")
    s += [P("TC Checklist checks for a new version every time it opens. When one arrives while you're using it, a "
            "note says <b>A New Version Is Ready</b>: click <b>Reload</b>."),
          box("If something looks out of date, do a hard reload once: <b>Ctrl+Shift+R</b> on Windows, "
              "<b>Cmd+Shift+R</b> on a Mac. On a phone, close the app fully and open it again.", "tip")]

    # ---- 13
    s += section(13, "For Managers And The Owner")
    s += [table(["Topic", "How it works"], [
        ["Who can use it", "Anyone with an @totalchb.com Google account. Access ends when the account is closed. The "
                           "database itself only lets verified @totalchb.com accounts in."],
        ["Names", "Names and photos come from the Universal Team Hub's team directory. Which departments come over is "
                  "the Vercel setting <b>HUB_TEAM_DEPTS</b> on the TC Checklist project (default <b>TC,DISPO</b>; "
                  "Managers always come over). Change it, then redeploy. Anyone not included shows a name built "
                  "from their email."],
        ["The connection", "TC Checklist signs its requests to the hub with its own secret "
                           "(<b>HUB_SYNC_SECRET</b> here, <b>TC_CHECKLIST_SYNC_SECRET</b> in the hub). It can only "
                           "read the team list."],
        ["Data", "Every property and answer lives in the company's Firebase project. Delete is permanent; there is "
                 "no recycle bin."],
        ["Changing the questions", "Ask the developer. New questions can only be added at the end of the list, "
                                   "because every saved answer is tied to its question's place."],
    ], [0.22, 0.78])]

    # ---- 14
    s += section(14, "Good Habits")
    s += bullets([
        "<b>Start the property before the call</b>, with the CRM link, so the team can find it.",
        "<b>Type answers, not just ticks.</b> A tick says the question was asked; the answer is what the team needs.",
        "<b>Put amounts in their own boxes</b> (HOI, Taxes) and payoff details in full.",
        "<b>Watch the badge.</b> Green All Saved means the team has it.",
        "<b>Mark it Closed or Cancelled</b> when the deal ends, so Open stays a true to-do list.",
        "<b>Cancel rather than delete</b>, unless it's a mistake like a mistyped address.",
        "<b>Keep seller details inside the company.</b> Only share printouts with people on the deal.",
    ])

    # ---- 15
    s += section(15, "Quick Answers")
    s += [table(["Question", "Answer"], [
        ["It says Access Denied.", "Sign in with your @totalchb.com Google account, not a personal one."],
        ["Where did Load Cloud Save and Reset Call go?", "Every property is on the Properties page now; click one to "
                                                         "open it. For the next call, click New Property."],
        ["I mistyped the address.", "Create it again with the right address, copy anything you'd entered, then "
                                    "delete the wrong one."],
        ["The badge says Not Saved.", "Check your internet connection. It keeps retrying; click the badge to try "
                                      "now. Don't close the page until it's green."],
        ["I can't type in a property.", "It's Closed or Cancelled, so it's view-only. Click Reopen if it needs work."],
        ["A teammate's answer isn't showing.", "It appears within a second or two. If not, check the badge and your "
                                               "connection, then reload."],
        ["The printout cut something off.", "It shouldn't: every answer prints in full. Make sure you used Print / "
                                            "PDF in the app, not the browser's own print."],
        ["It looks different from a teammate's screen.", "One of you has an older version: do a hard reload "
                                                         "(section 12)."],
        ["Someone shows as an email-style name.", "Their department isn't brought over from the hub. A manager can "
                                                  "add it (section 13)."],
        ["Does it work on my phone?", "Yes, with the same link and sign-in (section 11)."],
        ["Who sees my changes?", "Everyone on the team, immediately. Your name is recorded as the last person to "
                                 "update the property."],
    ], [0.38, 0.62])]

    # ---- reference card
    s += [PageBreak(), P("Quick Reference Card", "h1"), P("Print this page and keep it at your desk.", "lead")]
    ref = [
        ("Start a first call", "Properties → New Property → type the address → Create → paste the CRM Lead Link."),
        ("Find a property", "Properties → pick the tab → type in Search (address, CRM link or any answer)."),
        ("Record an answer", "Tick the question → type the answer under it. It saves by itself."),
        ("Escrow amounts", "Monthly Escrow Payments → HOI and Taxes boxes."),
        ("See everything", "Expand All. Close it up again with Collapse All."),
        ("Print or PDF", "Print / PDF → printer, or Save as PDF."),
        ("Deal closed", "Status → Mark Closed → confirm."),
        ("Deal fell through", "Status → Mark Cancelled → confirm."),
        ("Work on it again", "Open it → Reopen."),
        ("Remove a mistake", "Delete → type DELETE → Delete. Permanent."),
        ("Something looks old", "Ctrl+Shift+R (Cmd+Shift+R on a Mac). Phone: close and reopen."),
    ]
    s.append(table(["I want to…", "Do this"], [[a, b] for a, b in ref], [0.25, 0.75]))
    badge = Table([[Para('<font name="Nunito-Bold" color="#109648">All Saved</font><br/>Everything is saved for '
                         'the team.', S["cell"]),
                    Para('<font name="Nunito-Bold" color="#4D458A">Saving…</font><br/>On its way; waits if '
                         'you\'re offline.', S["cell"]),
                    Para('<font name="Nunito-Bold" color="#BD2239">Not Saved – Retry</font><br/>Didn\'t reach the '
                         'server. Retrying; click to try now.', S["cell"])]], colWidths=[WIDTH / 3] * 3)
    badge.setStyle(TableStyle([("BACKGROUND", (0, 0), (0, 0), GOOD_BG), ("BACKGROUND", (1, 0), (1, 0), ACCENT_SOFT),
                               ("BACKGROUND", (2, 0), (2, 0), BAD_BG), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                               ("LINEAFTER", (0, 0), (1, 0), 4, colors.white), ("TOPPADDING", (0, 0), (-1, -1), 8),
                               ("BOTTOMPADDING", (0, 0), (-1, -1), 8), ("LEFTPADDING", (0, 0), (-1, -1), 9),
                               ("ROUNDEDCORNERS", [8, 8, 8, 8])]))
    s += [P("The saving badge", "h2"), badge, Spacer(1, 8)]
    st = Table([[Para('<font name="Nunito-Bold" color="#4D458A">Open</font><br/>Being worked. Every property '
                      'starts here.', S["cell"]),
                 Para('<font name="Nunito-Bold" color="#109648">Closed</font><br/>The deal closed. View-only until '
                      'reopened.', S["cell"]),
                 Para('<font name="Nunito-Bold" color="#767388">Cancelled</font><br/>The deal fell through. '
                      'View-only until reopened.', S["cell"])]], colWidths=[WIDTH / 3] * 3)
    st.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), LAV), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("LINEAFTER", (0, 0), (1, 0), 4, colors.white), ("TOPPADDING", (0, 0), (-1, -1), 8),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 8), ("LEFTPADDING", (0, 0), (-1, -1), 9),
                            ("ROUNDEDCORNERS", [8, 8, 8, 8])]))
    s += [P("Statuses", "h2"), st]
    return s


def build() -> Path:
    doc = BaseDocTemplate(str(OUT), pagesize=letter, title=f"{APP} User Guide",
                          author="Total Cash Home Buyers", subject=f"How to use {APP}")
    cover_frame = Frame(MARGIN, MARGIN, WIDTH, PAGE_H - 2 * MARGIN, id="cover")
    body = Frame(MARGIN, 0.8 * inch, WIDTH, PAGE_H - 1.75 * inch, id="body")
    doc.addPageTemplates([PageTemplate("cover", [cover_frame], onPage=cover),
                          PageTemplate("inner", [body], onPage=inner)])
    doc.build([Spacer(1, 1), *story()])
    return OUT


if __name__ == "__main__":
    print(build())
