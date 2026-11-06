import React from 'react';
import { createRoot } from 'react-dom/client';
import { StaffPage } from '../src/pages/StaffPage';
import { ApplicationShell } from '../src/components/shell/ApplicationShell';
import '../src/styles.css';
const canAccess=!new URLSearchParams(location.search).has('denied');
createRoot(document.getElementById('root')!).render(<ApplicationShell role="admin" canAccessStaff={canAccess} title="Staff" tab="staff" setTab={()=>{}} onLogout={()=>{}}><StaffPage canAccess={canAccess}/></ApplicationShell>);
