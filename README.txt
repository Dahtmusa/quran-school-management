AMQM Finance & Fees build fix

The previous finance-polish patch accidentally duplicated the component return block, causing:
Expected '</', got '<eof>' at line 936.

Replace:
src/app/fees/page.tsx

with the page.tsx in this patch.

No SQL is required.

The fixed file was parsed successfully as TSX with the TypeScript parser. A full project type-check/build could not be run in this environment because dependencies are not installed; existing project-wide dependency errors are unrelated.
