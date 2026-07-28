export function ledgerSummary(
  trips: { id: string; destination: string }[],
  expenses: { itinerary_id: string | null; amount: number }[],
) {
  const summary: Array<{ id: string | null; destination: string; count: number; total: number }> = trips.map((trip) => {
    const rows = expenses.filter((expense) => expense.itinerary_id === trip.id)
    return {
      ...trip,
      count: rows.length,
      total: rows.reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
    }
  })
  const unassigned = expenses.filter((expense) => !expense.itinerary_id)
  if (unassigned.length) {
    summary.push({
      id: null,
      destination: '历史未归档',
      count: unassigned.length,
      total: unassigned.reduce((sum, expense) => sum + Number(expense.amount || 0), 0),
    })
  }
  return summary
}
