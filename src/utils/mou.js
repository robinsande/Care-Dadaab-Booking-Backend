const MOU_CATEGORY_VALUES = Object.freeze([
  'implementing_partner',
  'government',
  'municipality',
  'staff',
]);

const CONTRACT_MOU_CATEGORIES = Object.freeze({
  'CARE Staff': 'staff',
  'Implementing Partner': 'implementing_partner',
  'Partner Organisation': 'implementing_partner',
  Government: 'government',
});

const getMouCategoryForContractType = (contractType) =>
  CONTRACT_MOU_CATEGORIES[String(contractType || '').trim()] || null;

const categoryLabel = (category) => ({
  implementing_partner: 'Implementing Partner',
  government: 'Government',
  municipality: 'Municipality',
  staff: 'CARE Staff',
}[category] || category);

module.exports = {
  MOU_CATEGORY_VALUES,
  CONTRACT_MOU_CATEGORIES,
  getMouCategoryForContractType,
  categoryLabel,
};