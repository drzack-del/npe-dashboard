import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Builds pointed at a test backend set VITE_ENV_LABEL (see .env.awstest) so a test copy with
// real data can never be mistaken for the live app. Unset on Vercel: nothing is shown.
const ENV_LABEL = import.meta.env.VITE_ENV_LABEL;
const envBanner = ENV_LABEL ? (
  <div role="status" style={{position:'sticky',top:0,zIndex:100000,backgroundColor:'#f59e0b',color:'#111827',
    textAlign:'center',fontSize:'13px',fontWeight:800,padding:'6px 12px',letterSpacing:'0.01em'}}>
    {ENV_LABEL}
  </div>
) : null;

createRoot(document.getElementById('root')).render(<>{envBanner}<App /></>);
