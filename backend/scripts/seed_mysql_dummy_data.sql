-- ============================================================
-- CMRAS MySQL Dummy Data Seed
-- Targets: root/Kavindu2003 @ localhost, database: cmras
-- Users in DB: Birth(9), Midwife(6), Nutri(7), MOH(5), RDHS(4), PDHS(3), Admin(2)
-- Areas: Ministry(1), PDHS-Western(2), RDHS-Colombo(3), MOH-Kosgama(6), PHM-Salawa(7)
-- Hospital: Avissawella Base Hospital (id=1)
-- ============================================================

-- ---------------------------------------------------------------
-- 1. Fix existing children missing PHM/MOH area assignments
-- ---------------------------------------------------------------

-- Yumin Menthaka (id=2) — assign to Salawa PHM + Kosgama MOH
UPDATE children SET
  phm_area_id       = 7,
  moh_area_id       = 6,
  current_assigned_role    = 'midwife',
  current_assigned_area_id = 7,
  current_assigned_user_id = 6,
  assigned_date     = '2026-03-01 08:00:00',
  updated_at        = NOW()
WHERE id = 2;

-- Tharaka Balasuriya (id=4) — assign areas, keep transfer/escalation status
UPDATE children SET
  phm_area_id       = 7,
  moh_area_id       = 6,
  updated_at        = NOW()
WHERE id = 4;

-- ---------------------------------------------------------------
-- 2. Add referral + escalation records for Tharaka (id=4)
-- ---------------------------------------------------------------

INSERT INTO child_referrals (
  child_id, referred_by_user_id, referred_to_role, hospital_id,
  status, referral_reason, reviewed_by_user_id, reviewed_at,
  created_at, updated_at
) VALUES (
  4, 6, 'nutritionist', 1,
  'ACCEPTED', 'Child presented with SAM at 1 month. Referred to hospital nutritionist for therapeutic feeding programme.',
  7, '2026-03-15 10:30:00',
  '2026-03-11 09:00:00', '2026-03-15 10:30:00'
);

INSERT INTO child_escalations (
  child_id, escalated_by_user_id, from_role, to_role,
  moh_id, reason, previous_risk_level, new_risk_level,
  status, reviewed_by_user_id, reviewed_at, review_notes,
  created_at
) VALUES (
  4, 6, 'midwife', 'nutritionist',
  6, 'Infant born with SAM (weight 2.00 kg). Immediate nutritional intervention required.',
  'SAM', 'SAM',
  'REVIEWED', 7, '2026-03-15 10:00:00', 'Accepted into therapeutic feeding programme at Avissawella Base Hospital.',
  '2026-03-11 09:00:00'
);

-- ---------------------------------------------------------------
-- 3. Add 2 new children registered April 22, 2026
-- ---------------------------------------------------------------

-- Child 5: Nimalsha Perera (Female, born Dec 15, MAM at birth → improving)
INSERT INTO children (
  child_unique_id, child_id, name, dob, gender,
  birth_weight_kg, birth_height_cm,
  guardian_name, mother_name, guardian_phone, guardian_nic, address,
  hospital_id, registered_by_user_id, registered_by_clinic, registration_date,
  birth_risk_level, current_risk_level, last_risk_update,
  transfer_status, is_transferred, escalation_status,
  phm_area_id, moh_area_id,
  current_assigned_role, current_assigned_area_id, current_assigned_user_id,
  assigned_date, status, is_draft, created_at, updated_at
) VALUES (
  'MCH-20260422-110001', 'MCH-20260422-110001',
  'Nimalsha Perera', '2025-12-15', 'female',
  2.50, 47.0,
  'Kamala Perera', 'Kamala Perera', '0712345678', '956231456V',
  '45/A Salawa Road, Kosgama, Colombo',
  1, 9, 'Avissawella Base Hospital', '2026-04-22 09:30:00',
  'MAM', 'NORMAL', '2026-04-22 09:30:00',
  'NONE', 0, 'NONE',
  7, 6,
  'midwife', 7, 6,
  '2026-04-22 09:30:00', 'ACTIVE', 0,
  '2026-04-22 09:30:00', '2026-04-22 09:30:00'
);

-- Child 6: Ravindu Jayawardena (Male, born Nov 20, NORMAL throughout)
INSERT INTO children (
  child_unique_id, child_id, name, dob, gender,
  birth_weight_kg, birth_height_cm,
  guardian_name, mother_name, guardian_phone, guardian_nic, address,
  hospital_id, registered_by_user_id, registered_by_clinic, registration_date,
  birth_risk_level, current_risk_level, last_risk_update,
  transfer_status, is_transferred, escalation_status,
  phm_area_id, moh_area_id,
  current_assigned_role, current_assigned_area_id, current_assigned_user_id,
  assigned_date, status, is_draft, created_at, updated_at
) VALUES (
  'MCH-20260422-110002', 'MCH-20260422-110002',
  'Ravindu Jayawardena', '2025-11-20', 'male',
  3.20, 49.5,
  'Priyantha Jayawardena', 'Sunethra Jayawardena', '0723456789', '881234567V',
  '12 Main Street, Salawa, Colombo',
  1, 9, 'Avissawella Base Hospital', '2026-04-22 10:15:00',
  'NORMAL', 'NORMAL', '2026-04-22 10:15:00',
  'NONE', 0, 'NONE',
  7, 6,
  'midwife', 7, 6,
  '2026-04-22 10:15:00', 'ACTIVE', 0,
  '2026-04-22 10:15:00', '2026-04-22 10:15:00'
);

-- ---------------------------------------------------------------
-- 4. Measurement history
-- ---------------------------------------------------------------

-- === Yumin Menthaka (child id=2, male, DOB 2026-02-26) ===
-- Mar 2026 (~1 month)
INSERT INTO measurements (child_id, measurement_date, weight_kg, height_cm, muac_cm,
  z_score_wfa, z_score_hfa, z_score_wfh, risk_level, predicted_risk_next_2_months,
  model_confidence, measured_by_user_id, notes, created_at)
VALUES (2, '2026-03-05 09:00:00', 4.10, 53.5, 12.0,
  -0.50, -0.30, -0.20, 'NORMAL', 'NORMAL', 0.91, 6,
  'Monthly growth monitoring. Weight gain on track.', '2026-03-05 09:00:00');

-- Apr 2026 (~1.5 months)
INSERT INTO measurements (child_id, measurement_date, weight_kg, height_cm, muac_cm,
  z_score_wfa, z_score_hfa, z_score_wfh, risk_level, predicted_risk_next_2_months,
  model_confidence, measured_by_user_id, notes, created_at)
VALUES (2, '2026-04-05 09:15:00', 5.20, 57.0, 13.0,
  -0.40, -0.20, -0.15, 'NORMAL', 'NORMAL', 0.93, 6,
  'Healthy growth. Exclusive breastfeeding maintained.', '2026-04-05 09:15:00');

-- May 2026 (~2 months)
INSERT INTO measurements (child_id, measurement_date, weight_kg, height_cm, muac_cm,
  z_score_wfa, z_score_hfa, z_score_wfh, risk_level, predicted_risk_next_2_months,
  model_confidence, measured_by_user_id, notes, created_at)
VALUES (2, '2026-05-05 09:30:00', 6.00, 60.0, 13.5,
  -0.30, -0.15, -0.10, 'NORMAL', 'NORMAL', 0.94, 6,
  'Continues on healthy growth trajectory.', '2026-05-05 09:30:00');

-- === Sewwandi Rathnayake (child id=3, female, DOB 2026-01-25) — already has Feb+Mar ===
-- Apr 2026 (~2.5 months)
INSERT INTO measurements (child_id, measurement_date, weight_kg, height_cm, muac_cm,
  z_score_wfa, z_score_hfa, z_score_wfh, risk_level, predicted_risk_next_2_months,
  model_confidence, measured_by_user_id, notes, created_at)
VALUES (3, '2026-04-01 10:30:00', 5.20, 57.5, 13.0,
  -0.20, -0.10, -0.15, 'NORMAL', 'NORMAL', 0.92, 6,
  'Good weight gain. Mother counselled on complementary feeding introduction.', '2026-04-01 10:30:00');

-- May 2026 (~3.5 months)
INSERT INTO measurements (child_id, measurement_date, weight_kg, height_cm, muac_cm,
  z_score_wfa, z_score_hfa, z_score_wfh, risk_level, predicted_risk_next_2_months,
  model_confidence, measured_by_user_id, notes, created_at)
VALUES (3, '2026-05-01 10:45:00', 5.90, 60.5, 13.5,
  -0.15, -0.10, -0.10, 'NORMAL', 'NORMAL', 0.95, 6,
  'Excellent progress. Continuing breastfeeding.', '2026-05-01 10:45:00');

-- === Tharaka Balasuriya (child id=4, male, DOB 2026-02-09, SAM→MAM→NORMAL) ===
-- Mar 2026 (~1 month) — SAM, measured by nutritionist after referral
INSERT INTO measurements (child_id, measurement_date, weight_kg, height_cm, muac_cm,
  z_score_wfa, z_score_hfa, z_score_wfh, risk_level, predicted_risk_next_2_months,
  model_confidence, measured_by_user_id, notes, created_at)
VALUES (4, '2026-03-15 11:00:00', 2.30, 48.5, 8.5,
  -3.50, -2.80, -3.10, 'SAM', 'MAM', 0.87, 7,
  'SAM confirmed. Initiated RUTF therapeutic feeding programme. F-75 milk formula started.',
  '2026-03-15 11:00:00');

-- Apr 2026 (~2 months) — improving to MAM
INSERT INTO measurements (child_id, measurement_date, weight_kg, height_cm, muac_cm,
  z_score_wfa, z_score_hfa, z_score_wfh, risk_level, predicted_risk_next_2_months,
  model_confidence, measured_by_user_id, notes, created_at)
VALUES (4, '2026-04-10 11:15:00', 3.50, 52.0, 10.5,
  -2.50, -2.20, -2.30, 'MAM', 'NORMAL', 0.88, 7,
  'Significant improvement on therapeutic feeding. Transitioned to F-100 formula. MUAC improving.',
  '2026-04-10 11:15:00');

-- May 2026 (~3 months) — recovered to NORMAL
INSERT INTO measurements (child_id, measurement_date, weight_kg, height_cm, muac_cm,
  z_score_wfa, z_score_hfa, z_score_wfh, risk_level, predicted_risk_next_2_months,
  model_confidence, measured_by_user_id, notes, created_at)
VALUES (4, '2026-05-10 11:30:00', 4.50, 55.5, 11.8,
  -1.00, -0.80, -0.90, 'NORMAL', 'NORMAL', 0.92, 7,
  'Child has recovered to normal nutritional status. Continue RUTF for 4 more weeks then reassess.',
  '2026-05-10 11:30:00');

-- === Nimalsha Perera (child id=5, female, DOB 2025-12-15, MAM→NORMAL) ===
-- Jan 2026 (~1 month)
INSERT INTO measurements (child_id, measurement_date, weight_kg, height_cm, muac_cm,
  z_score_wfa, z_score_hfa, z_score_wfh, risk_level, predicted_risk_next_2_months,
  model_confidence, measured_by_user_id, notes, created_at)
VALUES (5, '2026-01-15 08:30:00', 3.00, 51.0, 10.5,
  -2.30, -1.80, -2.10, 'MAM', 'MAM', 0.85, 6,
  'Low birth weight infant. MAM identified. Mother counselled on exclusive breastfeeding and supplementary nutrition.',
  '2026-01-15 08:30:00');

-- Feb 2026 (~2 months)
INSERT INTO measurements (child_id, measurement_date, weight_kg, height_cm, muac_cm,
  z_score_wfa, z_score_hfa, z_score_wfh, risk_level, predicted_risk_next_2_months,
  model_confidence, measured_by_user_id, notes, created_at)
VALUES (5, '2026-02-15 08:45:00', 3.80, 54.5, 11.2,
  -2.10, -1.60, -1.90, 'MAM', 'NORMAL', 0.86, 6,
  'Weight gain of 800g in one month. Trend improving. Continue supplementary feeding programme.',
  '2026-02-15 08:45:00');

-- Mar 2026 (~3 months)
INSERT INTO measurements (child_id, measurement_date, weight_kg, height_cm, muac_cm,
  z_score_wfa, z_score_hfa, z_score_wfh, risk_level, predicted_risk_next_2_months,
  model_confidence, measured_by_user_id, notes, created_at)
VALUES (5, '2026-03-15 09:00:00', 4.50, 58.0, 12.0,
  -1.50, -1.00, -1.30, 'NORMAL', 'NORMAL', 0.89, 6,
  'Classified NORMAL. Excellent response to intervention. Continue monitoring monthly.',
  '2026-03-15 09:00:00');

-- Apr 2026 (~4 months, at registration on Apr 22)
INSERT INTO measurements (child_id, measurement_date, weight_kg, height_cm, muac_cm,
  z_score_wfa, z_score_hfa, z_score_wfh, risk_level, predicted_risk_next_2_months,
  model_confidence, measured_by_user_id, notes, created_at)
VALUES (5, '2026-04-22 09:45:00', 5.50, 61.5, 13.0,
  -0.80, -0.60, -0.70, 'NORMAL', 'NORMAL', 0.93, 6,
  'Healthy growth. Birth registration completed today. Continuing routine monitoring.',
  '2026-04-22 09:45:00');

-- === Ravindu Jayawardena (child id=6, male, DOB 2025-11-20, NORMAL throughout) ===
-- Jan 2026 (~1.5 months)
INSERT INTO measurements (child_id, measurement_date, weight_kg, height_cm, muac_cm,
  z_score_wfa, z_score_hfa, z_score_wfh, risk_level, predicted_risk_next_2_months,
  model_confidence, measured_by_user_id, notes, created_at)
VALUES (6, '2026-01-05 10:00:00', 4.20, 54.5, 12.5,
  -0.50, -0.40, -0.30, 'NORMAL', 'NORMAL', 0.92, 6,
  'Healthy growth at 6 weeks. Exclusive breastfeeding. No concerns.', '2026-01-05 10:00:00');

-- Feb 2026 (~2.5 months)
INSERT INTO measurements (child_id, measurement_date, weight_kg, height_cm, muac_cm,
  z_score_wfa, z_score_hfa, z_score_wfh, risk_level, predicted_risk_next_2_months,
  model_confidence, measured_by_user_id, notes, created_at)
VALUES (6, '2026-02-05 10:15:00', 5.50, 58.5, 13.5,
  -0.30, -0.25, -0.20, 'NORMAL', 'NORMAL', 0.94, 6,
  'Excellent weight gain. Milestone development on track.', '2026-02-05 10:15:00');

-- Mar 2026 (~3.5 months)
INSERT INTO measurements (child_id, measurement_date, weight_kg, height_cm, muac_cm,
  z_score_wfa, z_score_hfa, z_score_wfh, risk_level, predicted_risk_next_2_months,
  model_confidence, measured_by_user_id, notes, created_at)
VALUES (6, '2026-03-05 10:30:00', 6.50, 62.0, 14.0,
  -0.20, -0.15, -0.15, 'NORMAL', 'NORMAL', 0.95, 6,
  'Above average weight for age. Head circumference normal.', '2026-03-05 10:30:00');

-- Apr 2026 (~5 months, at registration on Apr 22)
INSERT INTO measurements (child_id, measurement_date, weight_kg, height_cm, muac_cm,
  z_score_wfa, z_score_hfa, z_score_wfh, risk_level, predicted_risk_next_2_months,
  model_confidence, measured_by_user_id, notes, created_at)
VALUES (6, '2026-04-22 10:30:00', 7.50, 65.0, 14.8,
  0.10, 0.05, 0.05, 'NORMAL', 'NORMAL', 0.96, 6,
  'Birth registration completed today. Very healthy growth. Mother educated on introduction of complementary foods.',
  '2026-04-22 10:30:00');

-- ---------------------------------------------------------------
-- 5. Clinic reports (Midwife monthly submissions to MOH)
-- ---------------------------------------------------------------

-- Jan 2026 — Midwife PHM area 7
INSERT INTO clinic_reports (
  phm_area_id, report_month, report_year,
  total_children_seen, normal_count, mam_count, sam_count, escalated_cases,
  submitted_to_moh, submitted_at, created_by_user_id, created_at, updated_at
) VALUES (
  7, 1, 2026,
  2, 1, 1, 0, 0,
  1, '2026-02-03 08:00:00', 6, '2026-01-31 16:00:00', '2026-02-03 08:00:00'
);

-- Feb 2026
INSERT INTO clinic_reports (
  phm_area_id, report_month, report_year,
  total_children_seen, normal_count, mam_count, sam_count, escalated_cases,
  submitted_to_moh, submitted_at, created_by_user_id, created_at, updated_at
) VALUES (
  7, 2, 2026,
  3, 2, 1, 0, 0,
  1, '2026-03-03 08:00:00', 6, '2026-02-28 16:00:00', '2026-03-03 08:00:00'
);

-- Mar 2026
INSERT INTO clinic_reports (
  phm_area_id, report_month, report_year,
  total_children_seen, normal_count, mam_count, sam_count, escalated_cases,
  submitted_to_moh, submitted_at, created_by_user_id, created_at, updated_at
) VALUES (
  7, 3, 2026,
  4, 3, 0, 1, 1,
  1, '2026-04-02 08:00:00', 6, '2026-03-31 16:00:00', '2026-04-02 08:00:00'
);

-- Apr 2026
INSERT INTO clinic_reports (
  phm_area_id, report_month, report_year,
  total_children_seen, normal_count, mam_count, sam_count, escalated_cases,
  submitted_to_moh, submitted_at, created_by_user_id, created_at, updated_at
) VALUES (
  7, 4, 2026,
  5, 5, 0, 0, 0,
  1, '2026-05-02 08:00:00', 6, '2026-04-30 16:00:00', '2026-05-02 08:00:00'
);

-- ---------------------------------------------------------------
-- 6. MOH reports (MOH monthly submissions to RDHS)
--    (MOH user id=5, MOH area id=6)
--    Jan + Feb already existed — add Mar + Apr
-- ---------------------------------------------------------------

-- Mar 2026 (MOH area=6, moh user=5)
INSERT INTO moh_reports (
  moh_id, moh_area_id,
  total_children, normal_count, mam_count, sam_count, total_escalations,
  month, report_year, sent_to_rdhs, sent_at, created_at
) VALUES (
  5, 6,
  4, 3, 0, 1, 1,
  3, 2026, 1, '2026-04-05 09:00:00', '2026-04-03 09:00:00'
);

-- Apr 2026
INSERT INTO moh_reports (
  moh_id, moh_area_id,
  total_children, normal_count, mam_count, sam_count, total_escalations,
  month, report_year, sent_to_rdhs, sent_at, created_at
) VALUES (
  5, 6,
  5, 5, 0, 0, 0,
  4, 2026, 1, '2026-05-05 09:00:00', '2026-05-03 09:00:00'
);

-- ---------------------------------------------------------------
-- Done
-- ---------------------------------------------------------------
SELECT 'Seed complete' AS status;
SELECT COUNT(*) AS total_children FROM children;
SELECT COUNT(*) AS total_measurements FROM measurements;
SELECT COUNT(*) AS total_clinic_reports FROM clinic_reports;
SELECT COUNT(*) AS total_moh_reports FROM moh_reports;
