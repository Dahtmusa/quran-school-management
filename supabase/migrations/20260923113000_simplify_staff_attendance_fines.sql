-- Simplify staff attendance: daily roster, configurable absence fines, and school fine-payment account.
INSERT INTO public.attendance_settings(key,value,description) VALUES
 ('staff_absent_fine_enabled','false','Automatically create a staff fine when a staff member is marked absent after the morning cutoff'),
 ('staff_absent_fine_amount','0','Fine amount for each unexcused staff absence'),
 ('staff_fine_payment_account_name','"AMQM School Account"','Account name displayed to staff for attendance fine payments'),
 ('staff_fine_payment_account_number','""','School bank/account number displayed to staff for attendance fine payments'),
 ('staff_fine_payment_bank','""','Bank name displayed to staff for attendance fine payments')
ON CONFLICT(key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_staff_attendance_fines_record_status
ON public.staff_attendance_fines(attendance_record_id,status);

NOTIFY pgrst,'reload schema';