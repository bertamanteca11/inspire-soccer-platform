import React from 'react';
import { createRoot } from 'react-dom/client';
import '../src/styles.css';
import '../src/styles/veo-analytics.css';
import { DesignReference } from '../src/components/premium/DesignReference';

// No App, Supabase, auth, operational hooks or business data are imported.
createRoot(document.getElementById('root')!).render(<React.StrictMode>
  <DesignReference/>
  <section aria-label="Legacy isolation probes">
    <div id="legacy-probe" className="card"><button className="primary">Legacy action probe</button></div>
    <div className="veo-module"><div id="veo-probe" className="veo-hero">VEO isolation probe</div></div>
  </section>
</React.StrictMode>);
