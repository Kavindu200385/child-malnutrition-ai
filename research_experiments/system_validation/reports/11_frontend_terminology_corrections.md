# Step 3C Frontend Terminology Corrections

## Scope and result

Step 3C changed frontend presentation only. It did not change WHO calculations, Flask APIs, database records, model artifacts, datasets, or referral permissions.

## Corrected presentation

| Area | Correction |
| --- | --- |
| Measurement results | Replaced automatic Normal/MAM/SAM result presentation and generated treatment plans with independent underweight, stunting, and wasting WHO screening indicators. |
| Child profile | Removed client-side simulated prediction generation and diagnosis/treatment alerts. Legacy MAM/SAM values are explicitly presented as recorded legacy labels, not confirmed diagnoses. |
| Growth charts | Replaced MAM/SAM chart zones, dot legends, and treatment directives with WHO screening-threshold wording. |
| Dashboards and reports | Qualified aggregate MAM/SAM data as legacy labels and replaced the future-risk dashboard with an unavailable/research-only state. |
| PDF output | Replaced diagnostic threshold labels with screening-threshold language. |
| MOH review list | Clarified that transfer decisions require clinical review and are not determined by a legacy label alone. |

## Modified frontend files

- `frontend/src/utils/statusDisplay.ts`
- `frontend/src/components/health-worker/AddMeasurementView.tsx`
- `frontend/src/components/health-worker/ChildProfileView.tsx`
- `frontend/src/components/health-worker/WHOGrowthCharts.tsx`
- `frontend/src/components/health-worker/SharedDashboardLayout.tsx`
- `frontend/src/components/health-worker/MohDashboardView.tsx`
- `frontend/src/components/health-worker/MohHighRiskChildrenView.tsx`
- `frontend/src/components/health-worker/NutritionistDashboardView.tsx`
- `frontend/src/components/health-worker/ReportsView.tsx`
- `frontend/src/components/health-worker/PdfReportGenerator.tsx`
- `frontend/src/components/ChildProfileCard.tsx`
- `frontend/src/components/Login.tsx`
- `frontend/src/components/LoginScreen.tsx`
- `frontend/src/components/admin/AdminOverview.tsx`
- `frontend/src/components/admin/PdhsOverview.tsx`
- `frontend/src/components/admin/RdhsOverview.tsx`
- `frontend/src/components/admin/ReportsDashboard.tsx`

## Limitation

Legacy backend fields and aggregate APIs still use MAM/SAM tokens. They were not reclassified or rewritten in this frontend-only step; the frontend now qualifies their meaning rather than presenting them as clinical confirmation.
