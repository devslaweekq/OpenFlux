// admin-ui/web/src/components/clientFormSchema.js
export const TRANSPORTS = [
  "yandex",
  "vyandex",
  "cupsonline",
  "mailru",
  "telemost",
];
const NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

export const clientFormFields = [
  {
    name: "name",
    label: "Name",
    type: "text",
    required: true,
    editableOnEdit: false,
  },
  {
    name: "transport",
    label: "Transport",
    type: "select",
    options: TRANSPORTS,
    required: true,
    editableOnEdit: true,
  },
  {
    name: "url",
    label: "Document URL",
    type: "text",
    required: true,
    editableOnEdit: true,
  },
];

export function validateClientForm(values, { isEdit }) {
  const errors = {};
  if (!isEdit) {
    if (!values.name) {
      errors.name = "name is required";
    } else if (!NAME_PATTERN.test(values.name)) {
      errors.name = "invalid name (allowed: letters, digits, '-', '_')";
    }
  }
  if (!values.transport) {
    errors.transport = "transport is required";
  } else if (!TRANSPORTS.includes(values.transport)) {
    errors.transport = `unsupported transport (allowed: ${TRANSPORTS.join(", ")})`;
  }
  if (!values.url) {
    errors.url = "url is required";
  }
  return { valid: Object.keys(errors).length === 0, errors };
}
