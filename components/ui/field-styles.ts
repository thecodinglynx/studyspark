/**
 * Look shared by every text field, text area and dropdown, so an empty field
 * is recognisably a field: a lighter fill than the panel behind it, a visible
 * border, and a placeholder that is readable but clearly not entered text.
 */
export const fieldClasses =
  "w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-slate-100 shadow-sm transition placeholder:text-slate-400 hover:border-slate-500 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60 disabled:cursor-not-allowed disabled:opacity-60";

export const fieldErrorClasses =
  "border-rose-500 focus:border-rose-500 ring-1 ring-rose-500 focus:ring-rose-500/60";
