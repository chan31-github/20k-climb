export function applyTheme(value) {
  const v = value === 'light' || value === 'dark' ? value : 'auto';
  document.documentElement.dataset.theme = v;
  const dark = v === 'dark' || (v === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#12161c' : '#f6f4f1');
}
