const bins = Array.from({ length: 28 }, (_, index) => ({
  id: `bin-${index + 1}`,
  number: index + 1,
  label: `Bin ${index + 1}`
}));

export default bins;
