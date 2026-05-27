// City Pulse — Data Access Layer
// Adapts compact array format to getVal(city, field) interface

var DataAccess = window.DataAccess = (() => {
  let fieldIndex = {};
  let header = null;

  function init() {
    header = window.CITY_DATA_HEADER;
    if (!header || !header.fields) {
      console.error('CITY_DATA_HEADER not found');
      return false;
    }
    fieldIndex = {};
    header.fields.forEach((f, i) => { fieldIndex[f] = i; });
    return true;
  }

  function getVal(city, field) {
    const i = fieldIndex[field];
    if (i === undefined) return null;
    const v = city.v[i];
    return (v === null || v === undefined) ? null : v;
  }

  function getIndicator(city, field) {
    const i = fieldIndex[field];
    if (i === undefined) return null;
    const v = city.v[i];
    if (v === null || v === undefined) return null;
    return { value: v, unit: header.units[i], year: header.years[i] };
  }

  function getCities() {
    return window.CITY_DATA || [];
  }

  function getFieldNames() {
    return header ? header.fields : [];
  }

  return { init, getVal, getIndicator, getCities, getFieldNames };
})();
