/** POST /api/planner/run, as the backend sends it. */
export const SCENARIO_RESULT = {
  start: '2015-01-15',
  end: '2025-01-15',
  months: 120,
  spent: 900_000,
  x: {
    wealth: 2_100_000,
    wealth_real: 1_800_000,
    xirr: 0.0991,
    xirr_real: 0.07,
    own: 900_000,
    topped_up: 0,
    home: { value: 2_700_000, balance: 600_000, betterment_tax: 0, net_worth: 2_100_000 },
    account: null,
  },
  y: {
    wealth: 2_500_000,
    wealth_real: 2_100_000,
    xirr: 0.1207,
    xirr_real: 0.09,
    own: 0,
    topped_up: 900_000,
    home: null,
    account: { deposited: 900_000, value: 3_000_000, tax: 500_000, net_value: 2_500_000 },
  },
  difference: -400_000,
  difference_real: -300_000,
  breakeven: { appreciation: 0.0625, market_return: 0.12, mortgage_shift: null, rent_scale: 1.5 },
  average: { x: 1_200_000, y: 1_400_000, points: [] },
  warnings: ['After the last published CPI it is held flat'],
};

/** POST /api/planner/study: three windows and a win map of two start years by two horizons. */
export const STUDY_RESULT = {
  months: 120,
  summary: {
    windows: 3,
    first: '2002-01-15',
    last: '2002-03-15',
    effective: 1.02,
    p_win: 1 / 3,
    median_difference: -120_000,
    median_difference_real: -90_000,
    x_xirr: 0.05,
    y_xirr: 0.07,
    x_xirr_real: 0.03,
    y_xirr_real: 0.05,
  },
  before: 'AAPL has no data before 2001-12-24',
  after: null,
  windows: [],
  win_map: {
    horizons_years: [5, 10],
    rows: [
      {
        start: '2002-01-15',
        cells: [
          { x_xirr: 0.08, y_xirr: 0.02, difference: 300_000 },
          { x_xirr: 0.04, y_xirr: 0.045, difference: -20_000 },
        ],
      },
      { start: '2003-01-15', cells: [{ x_xirr: 0.03, y_xirr: 0.06, difference: -90_000 }, null] },
    ],
  },
  warnings: [],
};
