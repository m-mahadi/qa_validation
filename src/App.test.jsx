import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import App from "./App.jsx";

function runValidationWithEntry(entry) {
  render(<App />);

  const input = screen.getByPlaceholderText(/Paste generated JSON array here/i);
  fireEvent.change(input, { target: { value: JSON.stringify([entry]) } });

  fireEvent.click(screen.getByRole("button", { name: /Run Validation/i }));
}

describe("Bangla validation behavior", () => {
  it("accepts a valid Bangla single-hop Answer citation pattern", () => {
    const entry = {
      "Section Number": "Section 11",
      "Entry_ID": 1,
      "Question": "আমি বিদেশে মামলা করেছিলাম। বাংলাদেশে সময় গণনায় সেটা ধরা হবে কি?",
      "Subsection/Clause": "Subsection (2)",
      "Section Text": "In computing the period of limitation prescribed for any suit, the time during which the plaintiff has been prosecuting with due diligence another civil proceeding, whether in a court of first instance or of appeal, against the defendant shall be excluded where the proceeding relates to the same matter in issue and is prosecuted in good faith.",
      "IRAC_Reasoning": {
        "Issue": "বিদেশে করা দেওয়ানি কার্যক্রমের সময় সীমাবদ্ধতার গণনায় বাদ যাবে কি না।",
        "Rule": "বাদী একই বিষয়ে সদিচ্ছায় ও যথাযথ তৎপরতায় অন্য দেওয়ানি কার্যক্রম চালালে সেই সময়সীমা গণনা থেকে বাদ দেওয়া হয়।",
        "Application": "এখানে বাদী একই বিরোধে বিদেশে তৎপরতার সাথে মামলা চালিয়েছেন, তাই সেই সময় গণনা থেকে বাদ হবে এবং বাংলাদেশে দায়েরের সময় নির্ধারণে তা যুক্ত হবে না।"
      },
      "Answer": "The Limitation Act, 1908, Section 11, Subsection (2) অনুযায়ী, একই বিষয়ে সদিচ্ছায় বিদেশে মামলা চালানোর সময় সীমাবদ্ধতার গণনা থেকে বাদ যাবে, তাই বাংলাদেশে দায়েরের সময় নির্ধারণে সেই সময় আপনার বিরুদ্ধে ধরা হবে না।",
      "NO_IRAC_Reasoning": "The Limitation Act, 1908, Section 11, Subsection (2) অনুযায়ী, একই বিষয়ে সদিচ্ছায় ও যথাযথ তৎপরতায় বিদেশে দেওয়ানি কার্যক্রম চালালে সেই সময় সীমাবদ্ধতার হিসাব থেকে বাদ হয়। তাই বাংলাদেশে মামলা দায়েরের সময় গণনায় ওই সময় আপনার বিপক্ষে ধরা হবে না।",
      "Type": "Scope of Application",
      "Difficulty": "Medium",
      "Keywords": ["সীমাবদ্ধতা", "সদিচ্ছা", "দেওয়ানি কার্যক্রম"],
      "Cited Acts and Sections": "The Limitation Act, 1908, Section 11, Subsection (2)"
    };

    runValidationWithEntry(entry);

    expect(screen.getByText(/0 failures/i)).toBeInTheDocument();
    expect(screen.queryByText(/Bangla Answer must start with Act name/i)).not.toBeInTheDocument();
  });

  it("flags Bangla Answer when citation pattern is missing অনুযায়ী", () => {
    const entry = {
      "Section Number": "Section 11",
      "Entry_ID": 1,
      "Question": "আমি বিদেশে মামলা করেছিলাম। বাংলাদেশে সময় গণনায় সেটা ধরা হবে কি?",
      "Subsection/Clause": "Subsection (2)",
      "Section Text": "In computing the period of limitation prescribed for any suit, the time during which the plaintiff has been prosecuting with due diligence another civil proceeding, whether in a court of first instance or of appeal, against the defendant shall be excluded where the proceeding relates to the same matter in issue and is prosecuted in good faith.",
      "IRAC_Reasoning": {
        "Issue": "বিদেশে করা দেওয়ানি কার্যক্রমের সময় সীমাবদ্ধতার গণনায় বাদ যাবে কি না।",
        "Rule": "বাদী একই বিষয়ে সদিচ্ছায় ও যথাযথ তৎপরতায় অন্য দেওয়ানি কার্যক্রম চালালে সেই সময়সীমা গণনা থেকে বাদ দেওয়া হয়।",
        "Application": "এখানে বাদী একই বিরোধে বিদেশে তৎপরতার সাথে মামলা চালিয়েছেন, তাই সেই সময় গণনা থেকে বাদ হবে।"
      },
      "Answer": "The Limitation Act, 1908, Section 11, Subsection (2), একই বিষয়ে বিদেশে মামলা চালানোর সময় বাদ হবে।",
      "NO_IRAC_Reasoning": "The Limitation Act, 1908, Section 11, Subsection (2) অনুযায়ী, একই বিষয়ে সদিচ্ছায় বিদেশে দেওয়ানি কার্যক্রম চালালে সেই সময় সীমাবদ্ধতার হিসাব থেকে বাদ হয়।",
      "Type": "Scope of Application",
      "Difficulty": "Medium",
      "Keywords": ["সীমাবদ্ধতা", "সদিচ্ছা", "দেওয়ানি কার্যক্রম"],
      "Cited Acts and Sections": "The Limitation Act, 1908, Section 11, Subsection (2)"
    };

    runValidationWithEntry(entry);

    expect(screen.getByText(/Bangla Answer must start with Act name/i)).toBeInTheDocument();
  });
});
