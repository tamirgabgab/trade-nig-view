/** GET /api/planner/tax-presets, as the backend sends it. */
export const TAX_PRESETS = {
  as_of: '2026-11-26',
  source: 'Secondary sources',
  purchase: [
    {
      id: 'single_home_2026',
      name: 'Single home (2026)',
      note: 'Brackets frozen until 2028-01-15',
      brackets: [
        { up_to: 1_978_745, rate_pct: 0 },
        { up_to: null, rate_pct: 3.5 },
      ],
    },
    {
      id: 'additional_home_2026',
      name: 'Additional home (2026)',
      note: 'A temporary provision',
      brackets: [
        { up_to: 6_055_070, rate_pct: 8 },
        { up_to: null, rate_pct: 10 },
      ],
    },
  ],
  betterment: [
    {
      id: 'single_home',
      name: 'Single home',
      note: 'The 2025 ceiling',
      spec: { rate_pct: 25, single_home: true, ceiling: 5_008_000, linear: true, brackets: [] },
    },
    {
      id: 'additional_home',
      name: 'Additional home',
      note: '25 % of the real gain',
      spec: { rate_pct: 25, single_home: false, ceiling: 5_008_000, linear: true, brackets: [] },
    },
  ],
};

/** A POST /api/planner/home body: one track, two months to the sale. */
export const HOME_RESULT = {
  summary: {
    months: 2,
    loan: 600_000,
    equity: 400_000,
    purchase_tax: 0,
    purchase_costs: 30_000,
    first_payment: 3635.88,
    highest_payment: 3635.88,
    paid: 7271.76,
    interest: 3994.6,
    linkage: 0,
    owner_costs: 1000,
    rent: 11_000,
    value: 1_005_000,
    balance: 596_722.84,
    selling_costs: 24_120,
    early_repayment_fee: 0,
    betterment_tax: 0,
    net_worth: 384_157.16,
    net_worth_real: 382_500,
    xirr: -0.42,
    xirr_real: null,
  },
  tracks: [
    {
      amount: 600_000,
      months: 240,
      first_rate: 0.04,
      first_payment: 3635.88,
      highest_payment: 3635.88,
      total_interest: 272_611.2,
      total_linkage: 0,
    },
  ],
  schedule: [
    {
      date: '2026-02-15',
      payment: 3635.88,
      interest: 2000,
      principal: 1635.88,
      linkage: 0,
      balance: 598_364.12,
      rate: 0.04,
    },
  ],
  path: [
    {
      date: '2026-01-15',
      value: 1_000_000,
      balance: 600_000,
      net_worth: 376_000,
      payment: 0,
      costs: 0,
      rent: 0,
    },
  ],
  stress: [],
  warnings: ['After the last published CPI it is held flat'],
};
