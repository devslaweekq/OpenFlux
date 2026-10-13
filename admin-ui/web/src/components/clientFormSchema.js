// admin-ui/web/src/components/clientFormSchema.js
export const TRANSPORTS = ['yandex', 'vyandex', 'cupsonline', 'mailru', 'telemost'];
export const MODES = ['l3', 'l4'];
const NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

export const clientFormFields = [
    {
        name: 'name',
        label: 'Name',
        type: 'text',
        required: true,
        editableOnEdit: false,
    },
    {
        name: 'transport',
        label: 'Transport',
        type: 'select',
        options: TRANSPORTS,
        required: true,
        editableOnEdit: true,
    },
    {
        name: 'url',
        label: 'Document URL',
        type: 'text',
        required: true,
        editableOnEdit: true,
    },
    {
        name: 'mode',
        label: 'Mode',
        type: 'select',
        options: MODES,
        required: true,
        editableOnEdit: true,
    },
];

export function validateClientForm(values, { isEdit }) {
    const errors = {};
    if (!isEdit) {
        if (!values.name) {
            errors.name = 'name is required';
        } else if (!NAME_PATTERN.test(values.name)) {
            errors.name = "invalid name (allowed: letters, digits, '-', '_')";
        }
    }
    if (!values.transport) {
        errors.transport = 'transport is required';
    } else if (!TRANSPORTS.includes(values.transport)) {
        errors.transport = `unsupported transport (allowed: ${TRANSPORTS.join(', ')})`;
    }
    // cupsonline creates its own rooms when no url is given, so it's the one
    // transport where url isn't required.
    if (!values.url && values.transport !== 'cupsonline') {
        errors.url = 'url is required';
    }
    if (values.mode && !MODES.includes(values.mode)) {
        errors.mode = `unsupported mode (allowed: ${MODES.join(', ')})`;
    }
    return { valid: Object.keys(errors).length === 0, errors };
}
