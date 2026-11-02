// Synthetic visual reference only; not imported by App or the production entry.
import { useState } from 'react';
import { PremiumBadge, PremiumButton, PremiumCard, PremiumField, PremiumMetric, PremiumNotice, PremiumScope } from './primitives';

export function DesignReference() {
  const [selected, setSelected] = useState(false);
  const [name, setName] = useState('Synthetic squad');
  const [submissions, setSubmissions] = useState(0);
  return <PremiumScope><div className="ds-reference ds-stack">
    <div><p className="ds-caption">Inspire Soccer / provisional design foundations</p><h1>Club workspace</h1><p>Synthetic component reference. No account, operational data or network integration.</p></div>
    <div><span className="ds-accent">Provisional club palette</span></div>
    <div className="ds-grid" aria-label="Synthetic metrics">
      <PremiumMetric label="Recorded participation" value="18" scope="Synthetic session only"/>
      <PremiumMetric label="Evaluation average" value="4.20" unit="/ 5" scope="Illustrative value, not a calculation"/>
      <PremiumMetric label="Missing observations" value="Pending" scope="Pending is not zero"/>
    </div>
    <PremiumCard><h2>Actions</h2><div className="ds-actions">
      <PremiumButton onClick={() => setSubmissions(n => n + 1)}>Primary action</PremiumButton>
      <PremiumButton variant="secondary">Secondary action</PremiumButton>
      <PremiumButton variant="quiet">Quiet action</PremiumButton>
      <PremiumButton variant="danger">Destructive example</PremiumButton>
      <PremiumButton disabled>Unavailable action</PremiumButton>
      <PremiumButton loading>Saving example</PremiumButton>
      <PremiumButton variant="secondary" aria-pressed={selected} onClick={() => setSelected(value => !value)}>{selected ? 'Selected option' : 'Select option'}</PremiumButton>
    </div><p className="ds-caption" role="status">Local primary actions: {submissions}</p></PremiumCard>
    <PremiumCard><h2>Statuses</h2><div className="ds-actions">
      <PremiumBadge>Planned</PremiumBadge><PremiumBadge tone="info">Selected session</PremiumBadge>
      <PremiumBadge tone="success">Confirmed</PremiumBadge><PremiumBadge tone="warning">Pending review</PremiumBadge>
      <PremiumBadge tone="danger">Needs attention</PremiumBadge>
    </div></PremiumCard>
    <PremiumCard><h2>Form states</h2><form className="ds-stack" onSubmit={event => { event.preventDefault(); setSubmissions(n => n + 1); }}>
      <div className="ds-grid">
        <PremiumField label="Squad name" required hint="Local demonstration; nothing is saved." value={name} onChange={event => setName(event.target.value)}/>
        <PremiumField label="Session label" defaultValue="" error="Enter a session label."/>
        <PremiumField label="Unavailable field" value="Read access unavailable" disabled/>
        <PremiumField label="Read-only reference" value="SYNTHETIC-001" readOnly/>
      </div>
      <div className="ds-actions"><PremiumButton variant="secondary">Non-submit action</PremiumButton><PremiumButton type="submit">Submit locally</PremiumButton></div>
    </form></PremiumCard>
    <div className="ds-grid">
      <PremiumCard><h2>Loading</h2><PremiumNotice role="status">Loading synthetic observations...</PremiumNotice></PremiumCard>
      <PremiumCard><h2>Empty</h2><p>No observations in this synthetic selection.</p><p className="ds-caption">A missing observation is not a confirmed absence.</p></PremiumCard>
      <PremiumCard><h2>Error</h2><PremiumNotice tone="danger" role="alert">The example could not be loaded. No partial totals are shown.</PremiumNotice></PremiumCard>
      <PremiumCard><h2>Confirmed</h2><PremiumNotice tone="success">Confirmed example. This is a status, not a disabled action.</PremiumNotice></PremiumCard>
    </div>
  </div></PremiumScope>;
}
