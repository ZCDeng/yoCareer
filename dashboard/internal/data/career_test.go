package data

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/ZCDeng/yoCareer/dashboard/internal/model"
)

func TestParseApplicationsUsesTrackerNumberColumn(t *testing.T) {
	tempDir := t.TempDir()
	dataDir := filepath.Join(tempDir, "data")
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		t.Fatalf("failed to create data dir: %v", err)
	}

	applications := `# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
| 140 | 2026-04-16 | Arize AI | AI Engineer, Instrumentation | 4.7/5 | Evaluated | ✅ | [140](reports/140-arize-ai-engineer-instrumentation-2026-04-16.md) | Strong fit |
| 143 | 2026-04-16 | Arize AI | AI Sales Engineer, US | 4.1/5 | Evaluated | ❌ | [143](reports/143-arize-ai-sales-engineer-us-2026-04-16.md) | Good fit |
`

	applicationsPath := filepath.Join(dataDir, "applications.md")
	if err := os.WriteFile(applicationsPath, []byte(applications), 0o644); err != nil {
		t.Fatalf("failed to write applications tracker: %v", err)
	}

	apps := ParseApplications(tempDir)
	if len(apps) != 2 {
		t.Fatalf("expected 2 parsed applications, got %d", len(apps))
	}

	if apps[0].Number != 140 {
		t.Fatalf("expected first application number to be 140, got %d", apps[0].Number)
	}
	if apps[1].Number != 143 {
		t.Fatalf("expected second application number to be 143, got %d", apps[1].Number)
	}
	if apps[0].ReportNumber != "140" || apps[1].ReportNumber != "143" {
		t.Fatalf("expected report numbers to stay aligned with tracker IDs, got %q and %q", apps[0].ReportNumber, apps[1].ReportNumber)
	}
}

func TestReplaceStatusInLineReplacesStatusColumnOnly(t *testing.T) {
	line := "| 1 | 2026-05-06 | TestCo | Applied AI Engineer | 4.2/5 | Applied | ✅ | [001](reports/001.md) | note |"
	got := replaceStatusInLine(line, "Applied", "Interview")

	if !strings.Contains(got, "| Applied AI Engineer |") {
		t.Fatalf("expected role text to remain unchanged, got %q", got)
	}
	if !strings.Contains(got, "| Interview |") {
		t.Fatalf("expected status column to be updated, got %q", got)
	}
}

func TestEnrichFromScanHistoryReadsDataDirectory(t *testing.T) {
	tempDir := t.TempDir()
	dataDir := filepath.Join(tempDir, "data")
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		t.Fatalf("failed to create data dir: %v", err)
	}

	history := "url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n" +
		"https://example.com/job/123\t2026-05-06\tcompany_page\tSenior Backend Engineer\tAcme AI\tadded\n"
	if err := os.WriteFile(filepath.Join(dataDir, "scan-history.tsv"), []byte(history), 0o644); err != nil {
		t.Fatalf("failed to write scan history: %v", err)
	}

	apps := []model.CareerApplication{
		{
			Company: "Acme AI",
			Role:    "Senior Backend Engineer",
		},
	}

	enrichFromScanHistory(tempDir, apps)
	if apps[0].JobURL != "https://example.com/job/123" {
		t.Fatalf("expected job URL from data/scan-history.tsv, got %q", apps[0].JobURL)
	}
}

func TestResolveReportPathBlocksTraversal(t *testing.T) {
	tempDir := t.TempDir()

	valid, ok := ResolveReportPath(tempDir, "reports/001-demo.md")
	if !ok {
		t.Fatal("expected valid report path to pass")
	}
	expected := filepath.Join(tempDir, "reports", "001-demo.md")
	if valid != expected {
		t.Fatalf("expected resolved path %q, got %q", expected, valid)
	}

	cases := []string{
		"../secrets.txt",
		"reports/../../secrets.txt",
		"/etc/passwd",
		"output/001.pdf",
		"",
	}
	for _, tc := range cases {
		t.Run(tc, func(t *testing.T) {
			if _, ok := ResolveReportPath(tempDir, tc); ok {
				t.Fatalf("expected %q to be rejected", tc)
			}
		})
	}
}
