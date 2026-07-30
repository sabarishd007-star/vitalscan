from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

OUTPUT = "output/pdf/vitalscan-frontend-test-report.pdf"


def paragraph(text, style):
    return Paragraph(text, style)


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="ReportTitle",
    parent=styles["Title"],
    fontName="Helvetica-Bold",
    fontSize=24,
    leading=29,
    textColor=colors.HexColor("#123B78"),
    alignment=TA_CENTER,
    spaceAfter=7,
))
styles.add(ParagraphStyle(
    name="Subtitle",
    parent=styles["Normal"],
    fontSize=10,
    leading=14,
    alignment=TA_CENTER,
    textColor=colors.HexColor("#526171"),
    spaceAfter=16,
))
styles.add(ParagraphStyle(
    name="Section",
    parent=styles["Heading2"],
    fontName="Helvetica-Bold",
    fontSize=14,
    leading=18,
    textColor=colors.HexColor("#123B78"),
    spaceBefore=12,
    spaceAfter=8,
))
styles.add(ParagraphStyle(
    name="BodySmall",
    parent=styles["BodyText"],
    fontSize=9.4,
    leading=13,
    textColor=colors.HexColor("#25354A"),
))
styles.add(ParagraphStyle(
    name="TableHead",
    parent=styles["BodyText"],
    fontName="Helvetica-Bold",
    fontSize=8.5,
    leading=10,
    textColor=colors.white,
))
styles.add(ParagraphStyle(
    name="TableBody",
    parent=styles["BodyText"],
    fontSize=8.2,
    leading=10.5,
    textColor=colors.HexColor("#243447"),
))


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#D8E1EC"))
    canvas.line(18 * mm, 15 * mm, A4[0] - 18 * mm, 15 * mm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#66778A"))
    canvas.drawString(18 * mm, 10 * mm, "VitalScan - Frontend Test Report")
    canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=A4,
    rightMargin=18 * mm,
    leftMargin=18 * mm,
    topMargin=16 * mm,
    bottomMargin=22 * mm,
)

story = [
    paragraph("VitalScan Frontend Test Report", styles["ReportTitle"]),
    paragraph("Test run: 23 July 2026 | Local Vite application", styles["Subtitle"]),
]

summary = [
    [paragraph("Build", styles["TableHead"]), paragraph("Frontend pages", styles["TableHead"]), paragraph("Console result", styles["TableHead"]), paragraph("Lint", styles["TableHead"])],
    [paragraph("PASS", styles["TableBody"]), paragraph("6 routes rendered", styles["TableBody"]), paragraph("2 errors found", styles["TableBody"]), paragraph("FAIL - 13 errors", styles["TableBody"])],
]
summary_table = Table(summary, colWidths=[39 * mm, 48 * mm, 49 * mm, 38 * mm])
summary_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1769AA")),
    ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#EEF6FC")),
    ("GRID", (0, 0), (-1, -1), 0.45, colors.HexColor("#C6D8E8")),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("LEFTPADDING", (0, 0), (-1, -1), 7),
    ("RIGHTPADDING", (0, 0), (-1, -1), 7),
    ("TOPPADDING", (0, 0), (-1, -1), 7),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
]))
story.extend([summary_table, Spacer(1, 7 * mm)])

story.append(paragraph("Tests performed", styles["Section"]))
test_rows = [[
    paragraph("Area", styles["TableHead"]),
    paragraph("Result", styles["TableHead"]),
    paragraph("Evidence", styles["TableHead"]),
]]
tests = [
    ("Production build", "PASS", "npm run build completed successfully."),
    ("Home page", "PASS", "Hero, navigation, feature and workflow content rendered."),
    ("Report page", "PASS", "Health metrics, recommendations and PDF download control rendered."),
    ("PDF report action", "CHECK", "Click caused no console error; browser test harness did not observe a download event."),
    ("Scan page", "PARTIAL", "Inputs and scan interface rendered. Live scan was not run because it requires camera approval and saves data."),
    ("Dashboard", "PARTIAL", "Dashboard rendered, but the health chart request failed with HTTP 502."),
    ("History page", "PASS", "History page and report table rendered; no records were available."),
    ("About and Login", "PASS", "Both routes rendered successfully."),
    ("Static analysis", "FAIL", "npm run lint reported 13 errors."),
]
for area, result, evidence in tests:
    test_rows.append([
        paragraph(area, styles["TableBody"]),
        paragraph(result, styles["TableBody"]),
        paragraph(evidence, styles["TableBody"]),
    ])
tests_table = Table(test_rows, colWidths=[42 * mm, 24 * mm, 108 * mm], repeatRows=1)
tests_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1769AA")),
    ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#C6D8E8")),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7FAFD")]),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ("TOPPADDING", (0, 0), (-1, -1), 5),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
]))
story.append(tests_table)

story.append(paragraph("Issues requiring attention", styles["Section"]))
issues = [
    [paragraph("Priority", styles["TableHead"]), paragraph("Issue", styles["TableHead"]), paragraph("Recommended action", styles["TableHead"])],
    [paragraph("High", styles["TableBody"]), paragraph("The dashboard chart calls /api/reports, which returned HTTP 502 during testing.", styles["TableBody"]), paragraph("Connect HealthChart to the existing report service or provide the missing backend endpoint.", styles["TableBody"])],
    [paragraph("Medium", styles["TableBody"]), paragraph("ESLint reports 13 errors, including explicit any types, Fast Refresh export warnings, and a state update in an effect.", styles["TableBody"]), paragraph("Resolve lint findings before release and add the lint command to CI.", styles["TableBody"])],
    [paragraph("Medium", styles["TableBody"]), paragraph("There are no automated frontend test files or test-runner configuration in the project.", styles["TableBody"]), paragraph("Add component tests and end-to-end tests for report generation, navigation, camera denial, and failed API states.", styles["TableBody"])],
]
issues_table = Table(issues, colWidths=[21 * mm, 79 * mm, 74 * mm], repeatRows=1)
issues_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#B54708")),
    ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#E7CFB5")),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#FFF9F2"), colors.white]),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ("TOPPADDING", (0, 0), (-1, -1), 5),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
]))
story.append(issues_table)

story.append(Spacer(1, 7 * mm))
story.append(paragraph(
    "Release recommendation: Do not treat the current frontend as release-ready until the failed chart request and lint errors are fixed, and the camera and report-save flow are tested with an approved test account.",
    styles["BodySmall"],
))

story.append(PageBreak())
story.append(paragraph("Frontend test checklist", styles["ReportTitle"]))
story.append(paragraph(
    "Use this checklist for every release. Mark each case as Pass, Fail, Blocked, or Not Applicable and record the browser/device used.",
    styles["Subtitle"],
))

checklist_groups = [
    ("1. Navigation and page rendering", [
        "Open every route: Home, Scan, Dashboard, Report, History, About, Login, and Register.",
        "Verify navigation links, browser back/forward behavior, and direct URL loading for each route.",
        "Check headings, buttons, cards, tables, images, and empty states render without layout overlap.",
        "Verify mobile, tablet, and desktop breakpoints with no horizontal overflow.",
    ]),
    ("2. Report and PDF download", [
        "Verify health values shown in the report match the latest completed scan.",
        "Test Low, Medium, and High risk recommendations.",
        "Click Download Report (PDF) and confirm the file downloads successfully.",
        "Open the downloaded PDF and check its filename, timestamp, health summary, recommendations, and disclaimer.",
    ]),
    ("3. Scan workflow", [
        "Test camera permission allowed, denied, unavailable, and already-in-use states.",
        "Validate Age, Sleep Hours, and Stress Level inputs for empty, invalid, boundary, and valid values.",
        "Test file input selection and remove/replace behavior if the file is intended to be used.",
        "Run a scan with an approved test account and verify progress, results, alert messages, and report persistence.",
    ]),
    ("4. Data, errors, and security", [
        "Verify dashboard totals, chart data, and report history use the same saved reports.",
        "Test loading, empty, failed API, slow-network, and retry states for reports.",
        "Verify login, logout, registration, invalid credentials, and protected-route behavior.",
        "Confirm no sensitive health details are exposed in browser console, URLs, or error messages.",
    ]),
    ("5. Accessibility and quality", [
        "Navigate all interactive controls with keyboard only and verify visible focus states.",
        "Check form labels, button names, heading order, color contrast, and screen-reader announcements.",
        "Run lint and production build with zero errors before release.",
        "Run the suite on current Chrome, Edge, Firefox, and a mobile browser where supported.",
    ]),
]

for group_index, (title, checks) in enumerate(checklist_groups):
    if group_index == 3:
        story.append(PageBreak())
    story.append(paragraph(title, styles["Section"]))
    rows = [[paragraph("Test case", styles["TableHead"]), paragraph("Status", styles["TableHead"]), paragraph("Notes", styles["TableHead"])]]
    for check in checks:
        rows.append([
            paragraph(check, styles["TableBody"]),
            paragraph("Not tested", styles["TableBody"]),
            paragraph("", styles["TableBody"]),
        ])
    checklist_table = Table(rows, colWidths=[111 * mm, 28 * mm, 35 * mm], repeatRows=1)
    checklist_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1769AA")),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#C6D8E8")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7FAFD")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(checklist_table)

doc.build(story, onFirstPage=footer, onLaterPages=footer)
