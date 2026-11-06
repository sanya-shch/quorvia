// Settings of the response walk. An object (not a constant) so integration tests can
// shrink the batch size and exercise multi-page walking on small data.
export const analyticsConfig = {
  // How many responses are read from the DB per query.
  batchSize: 2000,
  // How many distinct text values per question are kept in memory for the top N.
  maxTrackedTextValues: 10_000,
  // How many raw text answers the detailed question analytics returns.
  maxTextAnswers: 1000,
  // How many distribution items the detailed analytics of a text question returns.
  maxTextDistribution: 100,
};
