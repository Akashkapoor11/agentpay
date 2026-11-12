'use client';

import { useMemo, useState } from 'react';
import { AgGridProvider, AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, themeQuartz } from 'ag-grid-community';

export default function AgentLedger({ offers = [], events = [], channel3Offers = [] }) {
  const [tab, setTab] = useState('offers');
  const offerColumns = useMemo(() => [
    { field: 'name', headerName: 'Offer', flex: 1.35 },
    { field: 'merchant', headerName: 'Merchant', width: 120 },
    { field: 'price', headerName: 'Unit', width: 88, valueFormatter: (p) => `$${Number(p.value).toFixed(0)}` },
    { field: 'shippingDays', headerName: 'Ship', width: 78, valueFormatter: (p) => `${p.value}d` },
    { field: 'tags', headerName: 'Catalogue tags', flex: 1, valueFormatter: (p) => Array.isArray(p.value) ? p.value.join(', ') : '—' },
    { field: 'fixtureSource', headerName: 'Data class', width: 145 },
    { field: 'why', headerName: 'Agent signal', flex: 1.8 }
  ], []);

  const channel3Columns = useMemo(() => [
    { field: 'name', headerName: 'External product', flex: 1.4 },
    { field: 'merchant', headerName: 'Retailer domain', width: 155 },
    { field: 'price', headerName: 'Observed price', width: 125, valueFormatter: (p) => p.value !== null && p.value !== undefined && Number.isFinite(Number(p.value)) ? `${Number(p.value).toFixed(2)} ${p.data?.currency || 'UNKNOWN'}` : '—' },
    { field: 'availabilityStatus', headerName: 'Observed stock', width: 125, valueFormatter: (p) => p.value === 'IN_STOCK' ? 'In stock' : p.value === 'OUT_OF_STOCK' ? 'Out of stock' : 'Unknown' },
    { field: 'externalId', headerName: 'Product ID', width: 135 },
    { field: 'offerId', headerName: 'Offer ID', width: 120 },
    { field: 'retrievedAt', headerName: 'Observed at (UTC)', width: 190 }
  ], []);

  const eventColumns = useMemo(() => [
    { field: 'time', headerName: 'Time', width: 96 },
    { field: 'stage', headerName: 'Stage', width: 150 },
    { field: 'action', headerName: 'Action', flex: 1.8 },
    { field: 'result', headerName: 'Result', flex: 1.25 },
  ], []);

  return (
    <section className="surface ledger">
      <div className="ledger-head">
        <div><span className="kicker">EVIDENCE LAYER</span><h2>Every agent decision stays inspectable.</h2><p>An inspectable evidence surface makes the commerce workflow legible to a judge, operator, or auditor. Demo-catalogue rows are explicitly labelled; Channel3 rows are timestamped external observations, not live quotes or checkout authority.</p></div>
        <div className="grid-brand">AG Grid</div>
      </div>
      <div className="tabs"><button className={tab === 'offers' ? 'active' : ''} onClick={() => setTab('offers')}>Demo checkout catalogue</button><button className={tab === 'channel3' ? 'active' : ''} onClick={() => setTab('channel3')}>Channel3 market data</button><button className={tab === 'events' ? 'active' : ''} onClick={() => setTab('events')}>Agent action ledger</button></div>
      <div className="grid-frame">
        <AgGridProvider modules={[AllCommunityModule]}>
          {tab === 'offers' ? <AgGridReact theme={themeQuartz} rowData={offers} columnDefs={offerColumns} defaultColDef={{ sortable: true, resizable: true, filter: true }} domLayout="autoHeight" suppressCellFocus /> : tab === 'channel3' ? <AgGridReact theme={themeQuartz} rowData={channel3Offers} columnDefs={channel3Columns} defaultColDef={{ sortable: true, resizable: true, filter: true }} domLayout="autoHeight" suppressCellFocus /> : <AgGridReact theme={themeQuartz} rowData={events} columnDefs={eventColumns} defaultColDef={{ sortable: true, resizable: true }} domLayout="autoHeight" suppressCellFocus />}
        </AgGridProvider>
      </div>
    </section>
  );
}
