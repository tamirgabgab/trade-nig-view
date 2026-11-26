import type { HomeResult } from '../api/planner.ts';
import styles from './Planner.module.css';
import { PlannerCards, type PlannerCard } from './PlannerCards.tsx';
import { PlannerHeading } from './PlannerHeading.tsx';
import { percent, shekels, signedShekels } from './plannerFormat.ts';
import { PlannerTable, type PlannerColumn } from './PlannerTable.tsx';

type TrackRow = HomeResult['tracks'][number];
type PathRow = HomeResult['path'][number];
type ScheduleRow = HomeResult['schedule'][number];

const TRACKS: PlannerColumn<TrackRow>[] = [
  ['Track', (_, index) => String(index + 1)],
  ['Amount', (t) => shekels(t.amount)],
  ['Months', (t) => String(t.months)],
  ['First rate', (t) => percent(t.first_rate)],
  ['First payment', (t) => shekels(t.first_payment)],
  ['Highest payment', (t) => shekels(t.highest_payment)],
  ['Interest, whole term', (t) => shekels(t.total_interest)],
  ['Linkage, whole term', (t) => shekels(t.total_linkage)],
];

const PATH: PlannerColumn<PathRow>[] = [
  ['Date', (p) => p.date],
  ['Value', (p) => shekels(p.value)],
  ['Mortgage balance', (p) => shekels(p.balance)],
  ['Payment', (p) => shekels(p.payment)],
  ['Owner costs', (p) => shekels(p.costs)],
  ['Rent', (p) => shekels(p.rent)],
  ['Net worth if sold', (p) => shekels(p.net_worth)],
];

const SCHEDULE: PlannerColumn<ScheduleRow>[] = [
  ['Date', (r) => r.date],
  ['Payment', (r) => shekels(r.payment)],
  ['Principal', (r) => shekels(r.principal)],
  ['Interest', (r) => shekels(r.interest)],
  ['Linkage', (r) => shekels(r.linkage)],
  ['Balance', (r) => shekels(r.balance)],
  ['Rate', (r) => percent(r.rate)],
];

/** A rise of a yearly rate in whole points: `+1 point`, `+2 points`. */
const rise = (fraction: number) => {
  const points = Math.round(fraction * 100);
  return `+${String(points)} point${points === 1 ? '' : 's'}`;
};

/** An apartment run: the totals, each track, and the months until the sale and of the loan. */
export function PlannerHomeResults({ result }: { result: HomeResult }) {
  const s = result.summary;
  // The stress rows are over the loan's whole term, so they are set against its highest payment.
  const highest = Math.max(0, ...result.schedule.map((row) => row.payment));
  const cards: PlannerCard[] = [
    ['Loan', shekels(s.loan), `With ${shekels(s.equity)} of equity`],
    ['Purchase tax', shekels(s.purchase_tax)],
    [
      'Purchase costs',
      shekels(s.purchase_costs),
      'The tax, the lawyer, the broker, the renovation',
    ],
    ['First payment', shekels(s.first_payment)],
    ['Highest payment', shekels(s.highest_payment), 'Until the sale'],
    [
      'Paid to the bank',
      shekels(s.paid),
      `Until the sale. Interest charged: ${shekels(s.interest)}; linkage added to the balance: ${shekels(s.linkage)}`,
    ],
    ['Owner costs', shekels(s.owner_costs), 'Maintenance and insurance until the sale'],
    ['Rent', shekels(s.rent), 'Saved or received until the sale'],
    ['Value at the sale', shekels(s.value)],
    ['Mortgage balance at the sale', shekels(s.balance)],
    [
      'Selling costs',
      shekels(s.selling_costs + s.early_repayment_fee),
      `Of it ${shekels(s.early_repayment_fee)} for repaying the mortgage early`,
    ],
    ['Betterment tax', shekels(s.betterment_tax)],
    [
      'Net worth at the sale',
      shekels(s.net_worth),
      'The value less the costs, the balance and the tax',
    ],
    ['Net worth, real', shekels(s.net_worth_real), 'In shekels of the purchase day'],
    [
      'Yearly return',
      percent(s.xirr),
      'XIRR on the cash put in: the equity, the costs and the payments, against the rent and the net worth',
    ],
    ['Yearly return, real', percent(s.xirr_real), 'After inflation'],
  ];
  return (
    <>
      <PlannerCards cards={cards} />
      {result.warnings.map((warning) => (
        <p key={warning} className={styles.warning}>
          {warning}
        </p>
      ))}
      {result.tracks.length > 0 && (
        <>
          <h2 className={styles.heading}>Mortgage tracks</h2>
          <PlannerTable label="Mortgage tracks" columns={TRACKS} rows={result.tracks} />
        </>
      )}
      {result.tracks.length > 0 && (
        <>
          <h2 className={styles.heading}>If the Bank of Israel rate rose</h2>
          {result.stress.length > 0 ? (
            <>
              <PlannerTable
                label="Rate stress"
                columns={[
                  ['Bank of Israel rate', (row) => rise(row.rise)],
                  ['Highest payment, whole term', (row) => shekels(row.highest_payment)],
                  ['Against the plan', (row) => signedShekels(row.highest_payment - highest)],
                  ['Paid until the sale', (row) => shekels(row.paid)],
                ]}
                rows={result.stress}
              />
              <p className={styles.note}>
                The same loan with the Bank of Israel rate that much higher from the second month
                on, everything else as entered: a prime track pays more at once, a variable one from
                its next reset. The highest payment is over the whole term of the loan, not only
                until the sale.
              </p>
            </>
          ) : (
            <p className={styles.note}>
              Every track has a fixed rate: the Bank of Israel rate does not move the payments.
            </p>
          )}
        </>
      )}
      <PlannerHeading
        csv="apartment path"
        rows={result.path}
        fields={['date', 'value', 'balance', 'payment', 'costs', 'rent', 'net_worth']}
      >
        Until the sale ({s.months} months)
      </PlannerHeading>
      <div className={styles.scroll}>
        <PlannerTable label="Until the sale" columns={PATH} rows={result.path} />
      </div>
      {result.schedule.length > 0 && (
        <>
          <PlannerHeading
            csv="mortgage schedule"
            rows={result.schedule}
            fields={['date', 'payment', 'principal', 'interest', 'linkage', 'balance', 'rate']}
          >
            Mortgage schedule, the whole term ({result.schedule.length} months)
          </PlannerHeading>
          <div className={styles.scroll}>
            <PlannerTable label="Mortgage schedule" columns={SCHEDULE} rows={result.schedule} />
          </div>
        </>
      )}
    </>
  );
}
