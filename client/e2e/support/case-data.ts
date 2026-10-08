// A generated case in the shape server/app/services/llm/case_generation.py asks for.

export const CNR = "DLND010004212026";

export const PETITION = `**IN THE HIGH COURT OF DELHI**
**CASE NO.: CRL.M.C. No. 1234/2026**
**CNR No.: ${CNR}**

**IN THE MATTER OF:**
**Raghav Menon v. State of NCT of Delhi and Another**

1. **Raghav Menon**, 34, director of Menon Realty Solutions Pvt. Ltd., resident of Vasant Kunj, New Delhi ... **APPLICANT**

**VERSUS**

1. **State of NCT of Delhi**, through Station House Officer, Police Station Dwarka, New Delhi ... **NON-APPLICANT NO. 1**
2. **Priya Khanna**, 38, school teacher, resident of Janakpuri, New Delhi ... **NON-APPLICANT NO. 2**

**PETITION UNDER SECTION 528 OF THE BHARATIYA NAGARIK SURAKSHA SANHITA, 2023 FOR QUASHING OF FIR NO. 41/2025:**

**BNS SECTIONS INVOLVED:**
- **Section 318 BNS - Cheating:** Dishonestly inducing the buyers to hand over money by showing them a sanction the project did not have.
- **Section 316 BNS - Criminal breach of trust:** Using advances entrusted for the Dwarka project to pay unrelated company debts.

**RELATED BNS SECTIONS:**
- **Section 336 BNS - Forgery:** Invoked because the sanction letter is said to be fabricated.

**MOST RESPECTFULLY SHEWETH:**
1. That the applicant seeks the quashing of FIR No. 41/2025 under BNS sections 318 and 316.
2. That the prosecution says the applicant collected ₹42,00,000 in booking advances for a project that never received approval.
3. That the applicant says the project stalled because a funding partner withdrew.
4. That eleven buyers paid advances between March and August 2024.
5. That the planning authority later said it had no record of the sanction letter.

**BACKGROUND AND CHRONOLOGY OF EVENTS:**
- **14/01/2025:** Priya Khanna files a complaint.
- **02/02/2025:** The applicant is arrested.

**GROUNDS:**
A. **No intention at the outset:** The failure to build is a civil dispute, not cheating.
B. **Delay in the complaint:** The complaint was filed months after the payments.

**EVIDENCE:**
- **Physical/Digital Evidence:**
  - **Booking receipts:** (Annexure A-1) Eleven receipts signed by Menon.

**PRAYER:**
It is, therefore, most respectfully prayed that this Hon'ble Court may graciously be pleased to:
(a) quash FIR No. 41/2025 and all proceedings arising from it;
(b) pass any other order which this Hon'ble Court deems fit.

**VERIFICATION:**
I, Raghav Menon, verify that the contents are true. Verified at New Delhi.
`;

export const EVIDENCE = [
  {
    id: "e1",
    exhibit_ref: "EX-01",
    title: "Booking receipts",
    evidence_type: "Document",
    description: "Eleven receipts signed by Menon, totalling ₹42,00,000.",
    source: "Submitted by the complainants",
    media_status: "generated",
    image_url: null,
  },
  {
    id: "e2",
    exhibit_ref: "EX-02",
    title: "WhatsApp messages",
    evidence_type: "Digital Evidence",
    description: "Messages from Menon to Priya Khanna promising that “all approvals are in place”.",
    source: "Phone of Priya Khanna",
    media_status: "failed",
    image_url: null,
  },
];

export const caseOf = (over: Record<string, unknown> = {}) => ({
  cnr: CNR,
  title: "Raghav Menon v. State of NCT of Delhi and Another",
  status: "not started",
  case_text: PETITION,
  created_at: "2026-09-28T10:00:00Z",
  user_role: "not_started",
  ai_role: "not_started",
  plaintiff_arguments: [],
  defendant_arguments: [],
  verdict: null,
  evidence: EVIDENCE,
  ...over,
});

export const PARTIES = [
  { id: "p1", name: "Raghav Menon", role: "applicant", occupation: "Director, Menon Realty", age: 34, address: "Vasant Kunj, New Delhi", bio: "Raghav Menon founded the company in 2019.\n\nHe says a funding partner withdrew.", can_chat: true },
  { id: "p2", name: "Priya Khanna", role: "non_applicant", occupation: "School teacher", age: 38, address: "Janakpuri, New Delhi", bio: null, can_chat: false },
];
