// Synthetic payloads shaped like the public ATS APIs. Fictional companies and roles.

export const GREENHOUSE_LIST = {
  jobs: [
    {
      id: 4001001,
      title: "IT Support Technician",
      absolute_url: "https://boards.greenhouse.io/examplecorp/jobs/4001001",
      updated_at: "2026-10-01T15:00:00-04:00",
      first_published: "2026-09-30T10:00:00-04:00",
      requisition_id: "REQ-77",
      location: { name: "Austin, TX" },
      metadata: [{ name: "Employment Type", value: "Full-time" }],
      departments: [{ name: "IT" }],
      content:
        "&lt;h3&gt;Responsibilities&lt;/h3&gt;&lt;ul&gt;&lt;li&gt;Troubleshoot printers &amp;amp; peripherals&lt;/li&gt;&lt;li&gt;Reset passwords in Active Directory&lt;/li&gt;&lt;/ul&gt;&lt;h3&gt;Requirements&lt;/h3&gt;&lt;ul&gt;&lt;li&gt;1+ years of help desk experience&lt;/li&gt;&lt;/ul&gt;",
    },
    {
      id: 4001002,
      title: "Remote Service Desk Analyst",
      absolute_url: "https://boards.greenhouse.io/examplecorp/jobs/4001002",
      updated_at: "2026-10-02T09:00:00Z",
      location: { name: "Remote - US" },
      content: "&lt;p&gt;Answer phone and chat support requests.&lt;/p&gt;",
    },
  ],
};

export const LEVER_LIST = [
  {
    id: "a1b2c3d4-0000-0000-0000-000000000001",
    text: "Field Service Technician",
    hostedUrl: "https://jobs.lever.co/examplelever/a1b2c3d4-0000-0000-0000-000000000001",
    applyUrl: "https://jobs.lever.co/examplelever/a1b2c3d4-0000-0000-0000-000000000001/apply",
    createdAt: 1790000000000,
    workplaceType: "on-site",
    categories: { location: "Round Rock, TX", commitment: "Full-time", team: "Field Ops" },
    descriptionPlain: "Travel to customer sites to repair POS systems.",
    lists: [{ text: "Requirements", content: "<li>2+ years of hardware repair experience</li><li>Valid driver's license</li>" }],
    salaryRange: { min: 50000, max: 58000, currency: "USD", interval: "per-year-salary" },
  },
];

export const ASHBY_BOARD = {
  jobs: [
    {
      id: "ash-1",
      title: "Desktop Support Specialist",
      location: "Pflugerville, TX",
      department: "IT",
      employmentType: "FullTime",
      isRemote: false,
      workplaceType: "OnSite",
      publishedAt: "2026-10-03T12:00:00Z",
      jobUrl: "https://jobs.ashbyhq.com/exampleashby/ash-1",
      applyUrl: "https://jobs.ashbyhq.com/exampleashby/ash-1/application",
      descriptionPlain: "Requirements\n- Desktop support experience\n- Windows 11",
      isListed: true,
      compensation: { summaryComponents: [{ compensationType: "Salary", interval: "1 YEAR", currencyCode: "USD", minValue: 52000, maxValue: 60000 }] },
    },
    { id: "ash-2", title: "Unlisted role", isListed: false, descriptionPlain: "" },
  ],
};

export const CAREER_PAGE_HTML = `<!doctype html><html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"POS Support Technician","description":"<p>Support POS systems and receipt printers.</p><ul><li>Customer communication</li></ul>","datePosted":"2026-10-02","employmentType":"FULL_TIME","hiringOrganization":{"@type":"Organization","name":"Example Cafe Co"},"jobLocation":{"@type":"Place","address":{"addressLocality":"Austin","addressRegion":"TX","addressCountry":"US"}},"baseSalary":{"@type":"MonetaryAmount","currency":"USD","value":{"@type":"QuantitativeValue","minValue":21,"maxValue":25,"unitText":"HOUR"}},"identifier":{"@type":"PropertyValue","value":"ECC-12"},"url":"https://careers.example.com/jobs/ecc-12"}</script>
<script type="application/ld+json">{ not valid json </script>
</head><body>Careers</body></html>`;
