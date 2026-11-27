// Validate select/multi-select values against live schema options; throws on unknown values
// so a draft can never silently create new options in Notion.
export async function makeGuard(notion, dataSourceIds) {
  const opts = {};
  for (const id of dataSourceIds) {
    const ds = await notion.dataSources.retrieve({ data_source_id: id });
    opts[id] = Object.fromEntries(Object.entries(ds.properties).filter(([, v]) => v.select || v.multi_select).map(([k, v]) => [k, new Set((v.select || v.multi_select).options.map(o => o.name))]));
  }
  return (dsId, properties, label) => {
    const bad = [];
    for (const [k, v] of Object.entries(properties)) {
      const allowed = opts[dsId][k]; if (!allowed) continue;
      const vals = v.select ? [v.select.name] : v.multi_select ? v.multi_select.map(o => o.name) : [];
      for (const x of vals) if (x && !allowed.has(x)) bad.push(`${k}="${x}"`);
    }
    if (bad.length) throw new Error(`${label}: values not in schema → ${bad.join(', ')}`);
  };
}
