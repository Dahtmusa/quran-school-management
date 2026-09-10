AMQM First Term Historical Evaluation - Partial Submission Fix

Production database migration 097_allow_partial_historical_submissions has already been applied.
Keep the migration in the repository for source/deployment history.

The fix allows the existing teacher Historical Evaluation "Submit ready" flow to submit any completed student(s), instead of the database rejecting every submission unless the entire class was included.

No frontend change is required for this fix because the current teacher page already submits only the completed students and keeps the rest in the saved draft.
