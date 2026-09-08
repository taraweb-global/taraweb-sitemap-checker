// Copyright 2026 TaraWeb. Apache-2.0.
const $ = id => document.getElementById(id);
let report, page = 0, controller;
const pageSize = 50;
function renderRows() {
  const filtered = report.rows.filter(row => row.url.toLowerCase().includes($('filter').value.toLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)); page = Math.min(page, pages - 1);
  $('rows').replaceChildren();
  for (const row of filtered.slice(page * pageSize, (page + 1) * pageSize)) {
    const tr = document.createElement('tr');
    for (const value of [row.url, row.valid ? 'Valid format' : 'Invalid format', row.status ?? row.statusNote, row.source]) { const td = document.createElement('td'); td.textContent = String(value); tr.append(td); }
    $('rows').append(tr);
  }
  $('page-label').textContent = filtered.length ? `${filtered.length} entries · Page ${page + 1} of ${pages}` : 'No URL entries match this view.';
  $('prev').disabled = page === 0; $('next').disabled = page >= pages - 1;
}
async function validate(event) {
  event?.preventDefault(); if (!$('form').reportValidity()) return;
  controller?.abort(); const current = new AbortController(); controller = current;
  $('submit').disabled = true; $('submit').textContent = 'Validating…'; $('error').hidden = true; $('retry').hidden = true; $('results').hidden = true;
  $('progress').textContent = 'Checking sitemap XML and child indexes. This can take up to a minute…'; $('form').setAttribute('aria-busy','true');
  try {
    const response = await fetch('/api/validate', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({url:$('url').value.trim(),checkStatus:$('http').checked}), signal:current.signal });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Check failed. Please retry.');
    if (controller !== current) return;
    report = data; page = 0; $('filter').value = ''; $('results').hidden = false;
    $('total').textContent = data.rows.length; $('valid').textContent = data.validUrls; $('invalid').textContent = data.invalidUrls;
    $('issues').textContent = `${data.summary?.diagnostics.errors ?? 0} / ${data.summary?.diagnostics.warnings ?? 0}`;
    $('verdict').textContent = data.summary?.valid ? 'XML checks passed' : 'XML needs attention';
    $('details').textContent = `${data.summary?.sources ?? 1} sitemap documents · Sitemap HTTP ${data.sitemapStatus}. ${data.statusRequested ? 'HEAD status checks cover up to 25 valid-format entries; remaining entries are not checked.' : 'Page HTTP statuses were not requested.'}`;
    $('findings').replaceChildren();
    for (const d of data.diagnostics) { const li = document.createElement('li'); li.textContent = `${d.severity.toUpperCase()} · ${d.code}: ${d.message}${d.sourceId ? ' — ' + d.sourceId : ''}`; $('findings').append(li); }
    $('diagnostic-note').textContent = data.diagnosticCount ? `Showing ${data.diagnostics.length} of ${data.diagnosticCount} findings.` : 'No XML validation findings.';
    renderRows(); $('progress').textContent = 'Check complete. Your report is ready.'; $('result-title').focus();
  } catch(error) {
    if (controller !== current || error.name === 'AbortError') return;
    $('error').textContent = error.message || 'Connection lost. Please retry.'; $('error').hidden = false; $('retry').hidden = false; $('progress').textContent = 'Check could not finish.';
  } finally { if(controller === current) { $('submit').disabled = false; $('submit').textContent = 'Validate sitemap →'; $('form').setAttribute('aria-busy','false'); } }
}
function download(text, extension, type) { const url = URL.createObjectURL(new Blob([text],{type})); const a=document.createElement('a');a.href=url;a.download=`taraweb-sitemap-report.${extension}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
function csvCell(value) { let text=String(value ?? ''); if (/^[\s]*[=+@\-]/u.test(text)) text="'"+text; return '"'+text.replaceAll('"','""')+'"'; }
$('form').addEventListener('submit',validate);$('retry').onclick=validate;
$('reset').onclick=()=>{controller?.abort();controller=null;report=null;$('form').reset();$('form').setAttribute('aria-busy','false');$('results').hidden=true;$('error').hidden=true;$('retry').hidden=true;$('submit').disabled=false;$('submit').textContent='Validate sitemap →';$('progress').textContent='Ready when you are. Add a sitemap URL to begin.';$('url').focus();};
$('filter').oninput=()=>{page=0;renderRows();};$('prev').onclick=()=>{page--;renderRows();};$('next').onclick=()=>{page++;renderRows();};
$('json').onclick=()=>download(JSON.stringify(report,null,2),'json','application/json');
$('csv').onclick=()=>download([['URL','Valid HTTP(S) format','HTTP status','Status note','Source sitemap'],...report.rows.map(r=>[r.url,r.valid,r.status,r.statusNote,r.source])].map(r=>r.map(csvCell).join(',')).join('\r\n'),'csv','text/csv');
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(`${report.url}\nURL entries: ${report.rows.length}\nValid format: ${report.validUrls}\nInvalid format: ${report.invalidUrls}\nXML checks: ${report.summary?.valid?'Passed':'Needs attention'}`);$('progress').textContent='Summary copied.';}catch{$('progress').textContent='Clipboard unavailable. Export JSON instead.';}};

