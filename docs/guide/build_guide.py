"""Builds the branded TC Checklist user guide (PDF) for the team.

    python3 docs/guide/build_guide.py  ->  guides/TC_Checklist_{Team,Team_Leader,Manager}_Guide.pdf and help/guides.json

The app's Help (photo menu → Help) shows the guide for the person's role inside the app, from help/guides.json, like
the Team Hub's: the Team Guide (Members), the Team Leader Guide and the Manager Guide (adds the manager section).
Team Leaders and Managers see their delete passwords in a slot the page fills from the server after sign-in; the
passwords are never written into these files. The PDFs are the same guides, for printing. Same look and building blocks as the Title Commitment Agent's guide. Screenshots in docs/guide/shots/ come from the app
on the local Firebase emulators with made-up sample properties and people, never real ones:
    cd tests && node run.mjs guide-shots.mjs
Fonts: Baloo 2 and Nunito Sans (SIL Open Font License), the same as the app. Needs reportlab and Pillow.
"""

from __future__ import annotations

import json
import re
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
GUIDES_DIR = ROOT / "guides"  # published with the app; the Help button opens these
ROLES = ("member", "lead", "manager")   # the Team Hub's roles: Member, Team Leader, Manager
OUTS = {"member": GUIDES_DIR / "TC_Checklist_Team_Guide.pdf", "lead": GUIDES_DIR / "TC_Checklist_Team_Leader_Guide.pdf",
        "manager": GUIDES_DIR / "TC_Checklist_Manager_Guide.pdf"}
AUD = "member"  # which guide is being built
KIND = {"member": "Team Guide", "lead": "Team Leader Guide", "manager": "Manager Guide"}
HELP_DIR = ROOT / "help"  # the in-app Help: help/guides.json and help/img/ (published with the app)
MODE = "pdf"  # "pdf" or "html" (the in-app Help); the same text builds both
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


# ---------------------------------------------------------------- the same blocks as HTML (in-app Help)
class H(str):
    """A piece of the in-app Help page."""


HTML_SECS: list = []


def htm(text: str) -> str:
    """ReportLab markup → HTML (the guide text is written with <b>, <br/> and <font color>)."""
    text = re.sub(r'<font name="[^"]*" color="(#[0-9A-Fa-f]{6})">', r'<span style="color:\1;font-weight:700">', text)
    text = re.sub(r'<font[^>]*>', '<span>', text)
    return text.replace('</font>', '</span>')


def h_img(name: str, crop=None, maxw: int = 1400, phone: bool = False) -> tuple[str, int, int]:
    (HELP_DIR / "img").mkdir(parents=True, exist_ok=True)
    im = PILImage.open(SHOTS / f"{name}.jpg").convert("RGB")
    if crop:
        w, h = im.size
        im = im.crop((int(crop[0] * w), int(crop[1] * h), int(crop[2] * w), int(crop[3] * h)))
    mw = 600 if phone else maxw
    if im.width > mw:
        im = im.resize((mw, round(im.height * mw / im.width)), PILImage.LANCZOS)
    tag = name + ("-" + "-".join(f"{c:.2f}" for c in crop) if crop else "")
    out = HELP_DIR / "img" / f"{tag}.jpg"
    im.save(out, quality=80, optimize=True, progressive=True)
    return f"help/img/{out.name}", im.width, im.height


def hP(text: str, style: str = "p"):
    if style == "h1":
        return H("") if text == "Contents" else H(f'<h2 data-sec id="sec-ref"><span class="num">★</span>{htm(text)}</h2>')
    if style == "h2":
        return H(f"<h3>{htm(text)}</h3>")
    return H(f'<p class="{style}">{htm(text)}</p>')


def hsection(n, title: str, lead: str = "", need: float = 0) -> list:
    HTML_SECS.append({"id": f"sec-{n}", "n": str(n), "title": title})
    out = [H(f'<h2 data-sec id="sec-{n}"><span class="num">{n}</span>{htm(title)}</h2>')]
    if lead:
        out.append(H(f'<p class="lead">{htm(lead)}</p>'))
    return out


def hsteps(items: list[str]):
    return H("<ol>" + "".join(f"<li>{htm(t)}</li>" for t in items) + "</ol>")


def hbullets(items: list[str]) -> list:
    return [H("<ul>" + "".join(f"<li>{htm(t)}</li>" for t in items) + "</ul>")]


def hbox(text: str, kind: str = "tip", title: str = ""):
    label = {"tip": "Tip", "warn": "Important", "bad": "Watch out", "good": "Good to know"}[kind]
    return H(f'<div class="box {kind}"><b>{htm(title or label)}.</b> {htm(text)}</div>')


def htable(head: list[str], rows: list[list[str]], widths=None, first_bold: bool = True):
    th = "".join(f"<th>{htm(h)}</th>" for h in head)
    tr = "".join("<tr>" + "".join(f"<td>{'<b>' + htm(c) + '</b>' if (i == 0 and first_bold) else htm(c)}</td>"
                                  for i, c in enumerate(r)) + "</tr>" for r in rows)
    return H(f'<div class="tbl"><table><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table></div>')


def hshot(name: str, caption: str, width: float = 1.0, crop=None, max_h: float = 0):
    src, w, h = h_img(name, crop)
    css = f' style="width:{round(width * 100)}%"' if width < 0.95 else ""
    return H(f'<figure><img src="{src}" width="{w}" height="{h}" loading="lazy" alt=""{css}>'
             f'<figcaption>{htm(caption)}</figcaption></figure>')


def hpair(left: str, right: str, caption: str, height: float = 0):
    imgs = "".join(f'<img src="{a}" width="{w}" height="{h}" loading="lazy" alt="">'
                   for a, w, h in (h_img(n, phone=True) for n in (left, right)))
    return H(f'<figure class="pair">{imgs}<figcaption>{htm(caption)}</figcaption></figure>')


_PDF = {"P": P, "section": section, "steps": steps, "bullets": bullets, "box": box, "table": table, "shot": shot, "pair": pair}
_HTML = {"P": hP, "section": hsection, "steps": hsteps, "bullets": hbullets, "box": hbox, "table": htable, "shot": hshot,
         "pair": hpair}


def P(*a, **k): return (_HTML if MODE == "html" else _PDF)["P"](*a, **k)                    # noqa: E302, E704
def section(*a, **k): return (_HTML if MODE == "html" else _PDF)["section"](*a, **k)        # noqa: E302, E704
def steps(*a, **k): return (_HTML if MODE == "html" else _PDF)["steps"](*a, **k)            # noqa: E302, E704
def bullets(*a, **k): return (_HTML if MODE == "html" else _PDF)["bullets"](*a, **k)        # noqa: E302, E704
def box(*a, **k): return (_HTML if MODE == "html" else _PDF)["box"](*a, **k)                # noqa: E302, E704
def table(*a, **k): return (_HTML if MODE == "html" else _PDF)["table"](*a, **k)            # noqa: E302, E704
def shot(*a, **k): return (_HTML if MODE == "html" else _PDF)["shot"](*a, **k)              # noqa: E302, E704
def pair(*a, **k): return (_HTML if MODE == "html" else _PDF)["pair"](*a, **k)              # noqa: E302, E704


def pw_slot() -> list:
    """Where Team Leaders and Managers see their delete passwords. In the app the page fills it from the server after
    sign-in; the PDF never holds a password."""
    if MODE == "html":
        return [H('<div data-tc-pw></div>')]
    return [box("Open <b>Help</b> in the app (click your initials → Help) to see the delete passwords you may use. They "
                "show there after you sign in, and are never printed in this guide or sent by email.", "warn",
                "Your passwords")]


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
    c.drawString(MARGIN, PAGE_H - 4.7 * inch, KIND[AUD])
    c.setFont("Nunito", 13)
    c.setFillColor(BODY)
    y = PAGE_H - 5.3 * inch
    for line in ("How to run the seller's first call, keep every answer in one place,",
                 "and track each property from Open to Closed."):
        c.drawString(MARGIN, y, line)
        y -= 19
    c.setFont("Nunito-Bold", 11)
    c.setFillColor(INK)
    c.drawString(MARGIN, PAGE_H - 6.35 * inch, {"member": "For: Transaction Coordinators and Dispo", "lead": "For: Team Leaders",
                                                 "manager": "For: Managers and the owner"}[AUD])
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
    c.drawRightString(PAGE_W - MARGIN, PAGE_H - 0.5 * inch, f"{APP} · {KIND[AUD]}")
    c.setStrokeColor(LINE)
    c.setLineWidth(0.6)
    c.line(MARGIN, PAGE_H - 0.72 * inch, PAGE_W - MARGIN, PAGE_H - 0.72 * inch)
    c.line(MARGIN, 0.62 * inch, PAGE_W - MARGIN, 0.62 * inch)
    c.drawString(MARGIN, 0.42 * inch, "Total Cash Home Buyers · Internal use only")
    c.setFillColor(INDIGO)
    c.setFont("Nunito-Bold", 9)
    c.drawRightString(PAGE_W - MARGIN, 0.42 * inch, str(doc.page))
    c.restoreState()


SECTIONS_ALL = [
    f"What {APP} Does", "Signing In", "Finding Your Way Around", "The Properties Page", "Starting A New Property",
    "Working The First Call", "Saving And Working Together", "Closing Or Cancelling A Property",
    "Printing Or Saving A PDF", "Deleting A Property", "On A Phone", "Getting The Newest Version",
    "For Managers And The Owner", "Good Habits", "Quick Answers",
]
MANAGER_ONLY = {"For Managers And The Owner"}


def secs() -> list[str]:
    return [t for t in SECTIONS_ALL if AUD == "manager" or t not in MANAGER_ONLY]


def num(title: str) -> int:
    return secs().index(title) + 1


def cards3(cards: list[tuple[str, str]]):
    if MODE == "html":
        return H('<div class="cards">' + "".join(f"<div><b>{htm(t)}</b>{htm(x)}</div>" for t, x in cards) + "</div>")
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
           for i, t in enumerate(secs(), 1)]
    toc.append([Para('<font name="Baloo" color="#BD2239">★</font>', S["toc"]),
                Para("Quick Reference Card (last page)", S["toc"])])
    t = Table(toc, colWidths=[0.4 * inch, WIDTH - 0.4 * inch])
    t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE), ("TOPPADDING", (0, 0), (-1, -1), 3),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 3), ("LEFTPADDING", (0, 0), (-1, -1), 2)]))
    s += [t, Spacer(1, 14),
          box({"member": lambda: f"Read sections 1–{num('Getting The Newest Version')} and keep the Quick Reference "
                                 "Card handy. Team Leaders and Managers have their own guides, with the delete passwords.",
               "lead": lambda: f"This is the Team Guide with what Team Leaders need: deleting a property with the TC "
                               f"Team Leader password (section {num('Deleting A Property')}).",
               "manager": lambda: f"This is the Team Guide plus the delete passwords (section "
                                  f"{num('Deleting A Property')}) and section {num('For Managers And The Owner')}, "
                                  "For Managers And The Owner."}[AUD](),
              "tip", "Who reads what"),
          box("TC Checklist now looks and works like the Universal Team Hub. There are no tick boxes: a question is done as soon as its answer box has text. It opens on a <b>Properties</b> list "
              "with <b>Open / Closed / Cancelled</b> tabs and a search box; edits save as you type and appear live "
              "for everyone; a property can be marked <b>Closed</b> or <b>Cancelled</b>; <b>Print / PDF</b> shows "
              "every answer in full; names come from the Team Hub; Help opens your role's guide inside the app; and deleting "
              "uses the Team Hub's delete passwords. Every question, and every answer already "
              "saved, is exactly where it was.", "good", "What's new in version 2")]
    s.append(PageBreak())

    # ---- 1
    s += section(num(f"What {APP} Does"), f"What {APP} Does",
                 "TC Checklist is the script for the seller's first call. It walks you through every question to ask, "
                 "keeps each answer with the property, and shares it live with the whole team.")
    s += [cards3([
        ("One list per property", "Mortgage, Pictures, Emergency Contact, HOA, SFHs, Land, Income Producing "
                                  "Properties and Mobile Homes: 79 questions, each with its own answer box."),
        ("Live for everyone", "Every answer saves as you type and shows on your teammates' screens at "
                              "once. Two people can work the same property without overwriting each other."),
        ("Open to Closed", "Every property starts Open. Mark it Closed or Cancelled when the deal ends; it moves to "
                           "its own tab and becomes view-only."),
    ]), Spacer(1, 10)]
    s += [P("What you get", "h2")]
    s += bullets([
        "<b>A Properties page</b> with every first call the team has started, searchable by address, CRM link or any "
        "answer.",
        "<b>For every property</b>: the CRM lead link, how many questions are answered, when it was last updated and "
        "by whom, and its status.",
        "<b>A printable record</b> of the call, with every answer in full.",
        "<b>An Eastern-time clock</b> from the server, so every time shown is the same for everyone.",
    ])
    s += [box("The checklist is a guide for the call, not a contract. Confirm anything important (payoffs, HOA "
              "approvals, zoning) with the source before it goes into a deal.", "warn")]

    # ---- 2
    s += section(num("Signing In"), "Signing In", "Only company Google accounts (@totalchb.com) can open it. There is no separate "
                                  "password.")
    s += [steps([
        "Go to <b>tc.totalchb.com</b> and bookmark it (or install it: section " + str(num("On A Phone")) + ").",
        "Click <b>Sign In With Google</b> and pick your <b>@totalchb.com</b> account.",
        "You stay signed in on that browser.",
        "On a shared computer, click your initials at the top right, then <b>Sign Out</b>.",
    ]), shot("01-signin", "The sign-in screen. Nothing else is visible until you sign in.", 0.5,
             crop=(0.28, 0.24, 0.72, 0.76))]
    s += [box("A personal Gmail or any other account is turned away with \"Access Denied. @totalchb.com emails "
              "only.\" Sign in again with your company account.", "tip")]

    # ---- 3
    s += section(num("Finding Your Way Around"), "Finding Your Way Around", need=4.5)
    s += [shot("02-home", "The header (top) and the Properties page.", 1.0, crop=(0, 0, 1, 0.33))]
    s += [table(["Where", "What it's for"], [
        ["Logo", "Click it from anywhere to go back to the Properties page."],
        ["Clock", "Eastern time from the server: the date with the 24-hour time on top, the date with AM / PM "
                  "beneath. It's the same on every device."],
        ["All Saved", "<b>Green</b>: every change is saved for the whole team. <b>Saving…</b> (purple): a change is "
                      "on its way. <b>Not Saved – Retry</b> (red): see section " + str(num("Saving And Working Together")) + "."],
        ["Active", "How many teammates are online now. Click it to see who, and whether they're on a phone or a "
                   "computer."],
        ["Sun / moon", "Light or dark look. It follows your device at first; your choice is remembered on that "
                       "browser."],
        ["Your initials", "Your name, email and role (from the Team Hub), <b>Help</b>, and <b>Sign Out</b>."],
    ], [0.2, 0.8])]
    s += [P("Help", "h2"),
          P("Click your initials, then <b>Help</b>. It opens the guide for your role inside the app, like the Team Hub: "
            "the <b>Team Guide</b> for Members, the <b>Team Leader Guide</b> or the <b>Manager Guide</b> (your role "
            "comes from the Team Hub). Pick a section on the left, or scroll. <b>PDF</b> downloads a copy to print. "
            "Team Leaders and Managers also see the delete passwords they may use."),
          shot("16-help", "Help: the guide for your role, with its contents.", 1.0, crop=(0.0, 0.0, 1.0, 1.0), max_h=4.3)]
    s += [shot("05-active", "Click Active to see who's online.", 0.5, crop=(0.6, 0.0, 0.98, 0.38)),
          shot("15-home-dark", "The dark look.", 1.0, crop=(0, 0, 1, 0.62))]

    # ---- 4
    s += section(num("The Properties Page"), "The Properties Page",
                 "Home. Every property the team has started, newest activity first.", need=7.5)
    s += [shot("02-home", "The Properties page: tabs, search, New Property and the property cards.", 1.0)]
    s += [table(["Part", "What it shows"], [
        ["Open / Closed / Cancelled", "The three lists. The number on each tab is how many properties it holds. "
                                      "Every property starts in Open."],
        ["The numbers at the top", "Open and Closed properties, and how far the Open ones are on average."],
        ["Search", "Type any part of an address, a CRM link or an answer. It searches the tab you're on and shows "
                   "where it matched."],
        ["A property card", "The address, its status, when it was last updated and by whom, a ring and a bar with "
                            "how many of the 79 questions are answered (green at 100%), and <b>Open In CRM</b>."],
    ], [0.27, 0.73])]
    s += [shot("03-search", "Searching for an HOA name finds the property and shows the answer it matched.", 1.0,
               crop=(0, 0.26, 1, 0.6))]
    s += [box("Click anywhere on a card to open its checklist. <b>Open In CRM</b> opens the lead in GoHighLevel in "
              "a new tab instead.", "tip")]

    # ---- 5
    s += section(num("Starting A New Property"), "Starting A New Property", "Start one as soon as the first call is booked.")
    s += [steps([
        "On the Properties page, click <b>New Property</b>.",
        "Type the property address exactly as it should appear, for example <b>1420 Sample Palm Dr, Exampleton FL "
        "33000</b>.",
        "Click <b>Create</b>. The checklist opens, ready for the call.",
        "Paste the GoHighLevel lead into <b>CRM Lead Link</b> at the top.",
    ]), shot("07-new-property", "New Property: type the address once.", 0.72, crop=(0.3, 0.3, 0.7, 0.68))]
    s += [box("The address can't be changed after it's created, because it's how the property is saved. If you "
              "make a typo, create the property again with the right address and delete the wrong one "
              f"(section {num('Deleting A Property')}).", "warn"),
          box("If the address already exists, <b>Create</b> simply opens it, so you never get two copies of the "
              "same property.", "good"),
          box("If you'd started a checklist before version 2 without typing an address, a yellow note on the "
              "Properties page offers <b>Start A Property With It</b>, which brings those answers into a new "
              "property.", "tip", "An old unsaved checklist")]

    # ---- 6
    s += section(num("Working The First Call"), "Working The First Call", need=5.0)
    s += [shot("08-checklist-top", "A property: its details at the top, then the sections.", 1.0)]
    s += [steps([
        "Work down the sections. Each one shows how many of its questions are answered (for example <b>6 / 7</b>), "
        "with a bar that fills as you go. A finished section turns green.",
        "Click a section's title to open or close it. <b>Expand All</b> and <b>Collapse All</b> are at the top.",
        "Type the seller's answer in the box under the question. It grows to fit long answers.",
        "As soon as a box has text, the question is done: its circle turns green with a check. Empty it, and the "
        "question is open again. There's nothing to tick.",
        "Paste a link (photos, a statement, a listing) and an open-link button appears in the box.",
        "Under <b>What is The Monthly Escrow Payments</b>, put the <b>HOI</b> and <b>Taxes</b> amounts in their own "
        "boxes.",
    ]), shot("09-mortgage-section", "Mortgage Questions with answers, including the HOI and Taxes boxes.", 1.0,
             crop=(0, 0.1, 1, 0.98), max_h=4.4)]
    s += [box("<b>An answer is what marks a question done.</b> If the seller has nothing to add, type a short "
              "answer such as <b>No</b>, <b>N/A</b> or <b>Not yet</b>, so the team can see it was asked. Spaces alone "
              "don't count.", "good", "Done = answered"),
          box("The escrow question is done when any of its boxes has text: its own answer, <b>HOI</b> or "
              "<b>Taxes</b>. Questions that were ticked in the earlier version still count as done, even if their box "
              "is empty.", "tip", "Good to know"),
          box("<b>Mobile Homes</b>: treat it like an SFH with all those questions, then add the Mobile Homes "
              "ones.", "tip")]

    # ---- 7
    s += section(num("Saving And Working Together"), "Saving And Working Together",
                 "There is no Save button. Every answer saves on its own, a moment after you stop typing.")
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
    s += section(num("Closing Or Cancelling A Property"), "Closing Or Cancelling A Property",
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
    s += section(num("Printing Or Saving A PDF"), "Printing Or Saving A PDF", "For the deal file, or to send to someone on the deal.")
    s += [steps([
        "Open the property and click <b>Print / PDF</b>.",
        "In the print window, pick your printer, or <b>Save as PDF</b> as the destination.",
    ])]
    s += bullets([
        "The top shows the address, CRM link, status, how many questions are answered, when it was last updated and "
        "when it was printed.",
        "<b>Every answer prints in full</b>, however long.",
        "Sections with nothing filled in are left out, to keep it short.",
    ])
    s += [shot("12-print", "The printed checklist.", 0.62, crop=(0, 0, 1, 0.62), max_h=4.6)]
    s += [box("The printout holds the seller's details. Keep it inside the company and only send it to people on "
              "the deal.", "warn")]

    # ---- 10
    s += section(num("Deleting A Property"), "Deleting A Property")
    s += [P("Deleting removes the property and every answer for the whole team, for good. Most of the time, "
            "<b>Mark Cancelled</b> is the better choice: it's off the Open list but still there if you need it."),
          P("Deleting follows the Team Hub's rules: only <b>Team Leaders</b> and <b>Managers</b> can delete a "
            "property, with the <b>TC Team Leader password</b> (the same one as in the Team Hub). Anyone with their "
            "own delete password uses that instead, and Remy only confirms.")]
    if AUD == "member":
        s += [P("If you click <b>Delete</b>, the app explains this and offers <b>Mark Cancelled Instead</b>."),
              shot("11b-delete-member", "A Member clicking Delete.", 0.6, crop=(0.28, 0.3, 0.72, 0.7)),
              box("If a property really has to go (say, a mistyped address), ask your Team Leader to delete it.", "tip")]
    else:
        s += [steps(["Open the property and click <b>Delete</b>.",
                     "Type the <b>TC Team Leader password</b> (or your own delete password, if you have one). The "
                     "passwords you may use are below.",
                     "Click <b>Delete</b>. A wrong password is refused, and nothing is deleted."]),
              shot("11-delete", "Deleting asks for the password.", 0.6, crop=(0.28, 0.27, 0.72, 0.73)),
              P("Your delete passwords", "h2")]
        s += pw_slot()
        s += [box("Keep the passwords to yourself, and never put them in a note, a message or an email. They're the same "
                  "in the Team Hub. Members can't see them.", "warn")]
        if AUD == "manager":
            s += [box("The passwords are set in the Team Hub's Vercel setting <b>HUB_DELETE_PASSWORDS</b>. Change one "
                      "there and both apps use it straight away.", "tip", "Changing a password")]

    # ---- 11
    s += section(num("On A Phone"), "On A Phone", need=5.5)
    s += [P("Same link, same sign-in. The header stacks into three rows, buttons fill the width, and menus slide up "
            "from the bottom. Answer boxes use a larger text size so the phone doesn't zoom in."),
          pair("21-phone-home", "22-phone-checklist", "On a phone: the Properties page and a checklist.", 4.4)]
    s += [box("To put it on your home screen: in Safari tap Share → <b>Add to Home Screen</b>; in Chrome open the three-dot menu → "
              "<b>Install app</b> or <b>Add to Home screen</b>.", "tip")]

    # ---- 12
    s += section(num("Getting The Newest Version"), "Getting The Newest Version")
    s += [P("TC Checklist checks for a new version every time it opens. When one arrives while you're using it, a "
            "note says <b>A New Version Is Ready</b>: click <b>Reload</b>."),
          box("If something looks out of date, do a hard reload once: <b>Ctrl+Shift+R</b> on Windows, "
              "<b>Cmd+Shift+R</b> on a Mac. On a phone, close the app fully and open it again.", "tip")]

    # ---- managers only
    if AUD == "manager":
        s += section(num("For Managers And The Owner"), "For Managers And The Owner")
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
            ["Roles and passwords", "Roles (Member, Team Leader, Manager) come from the Team Hub's directory, and "
                                    "decide which guide Help shows and who may delete. Deleting uses the Team Hub's "
                                    "delete passwords: the TC Team Leader password, or a person's own. They live only "
                                    "in the hub's setting HUB_DELETE_PASSWORDS and are checked on the server."],
            ["Data", "Every property and answer lives in the company's Firebase project. Delete is permanent; there is "
                     "no recycle bin."],
            ["Changing the questions", "Ask the developer. New questions can only be added at the end of the list, "
                                       "because every saved answer is tied to its question's place."],
        ], [0.22, 0.78])]

    # ---- 14
    s += section(num("Good Habits"), "Good Habits")
    s += bullets([
        "<b>Start the property before the call</b>, with the CRM link, so the team can find it.",
        "<b>Answer every question you ask</b>, even with a short No or N/A, so the team can see it was covered.",
        "<b>Put amounts in their own boxes</b> (HOI, Taxes) and payoff details in full.",
        "<b>Watch the badge.</b> Green All Saved means the team has it.",
        "<b>Mark it Closed or Cancelled</b> when the deal ends, so Open stays a true to-do list.",
        "<b>Cancel rather than delete</b>, unless it's a mistake like a mistyped address.",
        "<b>Keep seller details inside the company.</b> Only share printouts with people on the deal.",
    ])

    # ---- 15
    s += section(num("Quick Answers"), "Quick Answers")
    s += [table(["Question", "Answer"], [
        ["It says Access Denied.", "Sign in with your @totalchb.com Google account, not a personal one."],
        ["Where did Load Cloud Save and Reset Call go?", "Every property is on the Properties page now; click one to "
                                                         "open it. For the next call, click New Property."],
        ["I mistyped the address.", "Create it again with the right address, copy anything you'd entered, then "
                                    "delete the wrong one."],
        ["The badge says Not Saved.", "Check your internet connection. It keeps retrying; click the badge to try "
                                      "now. Don't close the page until it's green."],
        ["I can't delete a property.", "Only Team Leaders and Managers can, with the TC Team Leader password. Mark it "
                                       "Cancelled, or ask your Team Leader."] if AUD == "member" else
        ["It says the password is not right.", "Check it in Help (your initials → Help → Deleting A Property). It's "
                                               "the TC Team Leader password, the same as in the Team Hub."],
        ["Where did the tick boxes go?", "You don't need them: typing an answer marks the question done. Put "
                                        "No or N/A if there's nothing to say."],
        ["A question shows done but its box is empty.", "It was ticked in the earlier version, which still counts."],
        ["I can't type in a property.", "It's Closed or Cancelled, so it's view-only. Click Reopen if it needs work."],
        ["A teammate's answer isn't showing.", "It appears within a second or two. If not, check the badge and your "
                                               "connection, then reload."],
        ["The printout cut something off.", "It shouldn't: every answer prints in full. Make sure you used Print / "
                                            "PDF in the app, not the browser's own print."],
        ["It looks different from a teammate's screen.", "One of you has an older version: do a hard reload "
                                                         f"(section {num('Getting The Newest Version')})."],
        ["Someone shows as an email-style name.", "Their department isn't brought over from the hub. A manager can " +
                                                  ("add it (section " + str(num("For Managers And The Owner")) + ")." if AUD == "manager" else "add it.")],
        ["Does it work on my phone?", f"Yes, with the same link and sign-in (section {num('On A Phone')})."],
        ["Who sees my changes?", "Everyone on the team, immediately. Your name is recorded as the last person to "
                                 "update the property."],
    ], [0.38, 0.62])]

    # ---- reference card
    s += [PageBreak(), P("Quick Reference Card", "h1"), P("Print this page and keep it at your desk.", "lead")]
    ref = [
        ("Start a first call", "Properties → New Property → type the address → Create → paste the CRM Lead Link."),
        ("Find a property", "Properties → pick the tab → type in Search (address, CRM link or any answer)."),
        ("Record an answer", "Type it in the box under the question. It saves by itself, and the circle turns green."),
        ("Escrow amounts", "Monthly Escrow Payments → HOI and Taxes boxes."),
        ("See everything", "Expand All. Close it up again with Collapse All."),
        ("Print or PDF", "Print / PDF → printer, or Save as PDF."),
        ("Deal closed", "Status → Mark Closed → confirm."),
        ("Deal fell through", "Status → Mark Cancelled → confirm."),
        ("Work on it again", "Open it → Reopen."),
        ("Remove a mistake", "Ask your Team Leader, or Status → Mark Cancelled." if AUD == "member" else
                             "Delete → TC Team Leader password → Delete. Permanent."),
        ("Something looks old", "Ctrl+Shift+R (Cmd+Shift+R on a Mac). Phone: close and reopen."),
        ("Find this guide", "Click your initials → Help."),
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
    if MODE == "html":
        badge = H('<div class="cards"><div><b style="color:#109648">All Saved</b>Everything is saved for the team.</div>'
                  '<div><b>Saving…</b>On its way; waits if you\'re offline.</div>'
                  '<div><b style="color:#BD2239">Not Saved – Retry</b>Didn\'t reach the server. Retrying; click to try now.</div></div>')
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
    if MODE == "html":
        st = H('<div class="cards"><div><b>Open</b>Being worked. Every property starts here.</div>'
               '<div><b style="color:#109648">Closed</b>The deal closed. View-only until reopened.</div>'
               '<div><b style="color:#767388">Cancelled</b>The deal fell through. View-only until reopened.</div></div>')
    s += [P("Statuses", "h2"), st]
    return s


def build_one(aud: str) -> Path:
    global AUD
    AUD = aud
    out = OUTS[aud]
    out.parent.mkdir(exist_ok=True)
    doc = BaseDocTemplate(str(out), pagesize=letter, title=f"{APP} {KIND[aud]}",
                          author="Total Cash Home Buyers", subject=f"How to use {APP}")
    cover_frame = Frame(MARGIN, MARGIN, WIDTH, PAGE_H - 2 * MARGIN, id="cover")
    body = Frame(MARGIN, 0.8 * inch, WIDTH, PAGE_H - 1.75 * inch, id="body")
    doc.addPageTemplates([PageTemplate("cover", [cover_frame], onPage=cover),
                          PageTemplate("inner", [body], onPage=inner)])
    doc.build([Spacer(1, 1), *story()])
    return out


def flat(items) -> list:
    out = []
    for x in items:
        if isinstance(x, (list, tuple)):
            out += flat(x)
        else:
            out.append(x)
    return out


def build_help() -> Path:
    """help/guides.json: { member, lead, manager }: { title, sections: [{ id, n, title }], html }, with help/img/*.jpg."""
    global AUD, MODE
    img = HELP_DIR / "img"
    if img.exists():
        for f in img.glob("*.jpg"):
            f.unlink()
    out = {}
    MODE = "html"
    try:
        for aud in ROLES:
            AUD = aud
            HTML_SECS.clear()
            html = "".join(x for x in flat(story()) if isinstance(x, H))
            secs_ = list(HTML_SECS) + [{"id": "sec-ref", "n": "★", "title": "Quick Reference Card"}]
            out[aud] = {"title": KIND[aud], "sections": secs_, "html": html}
    finally:
        MODE = "pdf"
    target = HELP_DIR / "guides.json"
    target.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return target


def build() -> list[Path]:
    return [build_one(a) for a in ROLES] + [build_help()]


if __name__ == "__main__":
    print(build())
