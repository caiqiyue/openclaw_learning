---
name: pdf-resume-to-md
description: Convert a resume PDF (by filename) into a Markdown file with the same name using a local Python extractor. Supports deterministic output and extraction reports.
---

# **PDF Resume → Markdown**

Convert a specific resume PDF into Markdown by invoking a local Python script.

The PDF is identified **by filename**, resolved from a predefined resume directory, and saved as a .md file with the same base name.

Offline-only. No network access.

## Setup

1. **Install dependencies:**
   ```bash
   pip3 install pypdf
   ```
   
   Or use the provided requirements.txt:
   ```bash
   pip3 install -r requirements.txt
   ```

2. **Optional (better PDF metadata):** install poppler-utils / pdftotext

## Input Convention

- Resume PDF directory: `<RESUME_PDF_DIR>`
- Markdown output directory: `<RESUME_MD_DIR>`

Example:

- Input filename: `john_doe_resume.pdf`
- Resolved input path: `<RESUME_PDF_DIR>/john_doe_resume.pdf`
- Output file: `<RESUME_MD_DIR>/john_doe_resume.md`

## Convert Resume (Single PDF)

- Convert by filename:

  ```bash
  python pdf_to_md.py --input <RESUME_PDF_DIR>/john_doe_resume.pdf --output <RESUME_MD_DIR>/john_doe_resume.md
  ```

## Batch Conversion (Optional)

- Convert all PDFs in a directory:

  ```bash
  python pdf_to_md.py --input <RESUME_PDF_DIR> --output <RESUME_MD_DIR> --recursive
  ```

## Output Format

Each PDF produces exactly one Markdown file with the following structure:

- YAML frontmatter:
  - `source_pdf`
  - `pages`
  - `extracted_chars`
  - `extraction_method`
  - `timestamp_utc`
- Resume text body
- Page markers: `<!-- page:N -->`
- Extraction report (warnings, density, method)

## Limitations

- No OCR.
- Image-only or scanned PDFs may yield empty text.
- A Markdown file is still produced with warnings.

## Safety Notes

- Operates only on local files.
- No directory scanning beyond the resume root.
- No network access.
- No arbitrary shell execution.

## Notes

- Validate the PDF filename exists before execution.
- Warn before overwriting an existing .md file.
- Do not assume text completeness for scanned resumes.
