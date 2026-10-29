// admin-ui/web/src/components/ClientForm.jsx
import { useState } from 'react';
import { clientFormFields, validateClientForm } from './clientFormSchema.js';

export default function ClientForm({ initialValues = { name: '', transport: '', url: '', mode: 'l3' }, isEdit, onSubmit }) {
    const [values, setValues] = useState(initialValues);
    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);

    function handleChange(field, value) {
        setValues((prev) => ({ ...prev, [field]: value }));
    }

    async function handleSubmit(e) {
        e.preventDefault();
        const result = validateClientForm(values, { isEdit });
        setErrors(result.errors);
        if (!result.valid) return;
        setSubmitting(true);
        try {
            await onSubmit(values);
            setErrors({});
        } catch (err) {
            setErrors({ _submit: err.message });
        } finally {
            setSubmitting(false);
        }
    }

    // cupsonline (and, once wired up, avito) creates its own rooms when no
    // url is given -- that's a handful of real, sequential HTTP round trips
    // to the room service, so it can take tens of seconds, not the instant
    // the rest of this form responds in.
    const willBootstrapRooms = !isEdit && values.transport === 'cupsonline' && !values.url;

    return (
        <form onSubmit={handleSubmit} className='client-form flex flex-col gap-4 rounded-lg border border-line bg-panel p-5'>
            {clientFormFields.map((field) => {
                const disabled = isEdit && !field.editableOnEdit;
                const urlOptionalForCupsonline = field.name === 'url' && values.transport === 'cupsonline';
                return (
                    <label key={field.name} className='flex flex-col gap-1.5 text-sm font-medium text-ash/60'>
                        {field.label}
                        {urlOptionalForCupsonline && (
                            <span className='text-xs font-normal text-ash/40'>optional — leave blank to auto-create rooms</span>
                        )}
                        {field.type === 'select' ? (
                            <select
                                value={values[field.name]}
                                disabled={disabled}
                                onChange={(e) => handleChange(field.name, e.target.value)}
                                className='rounded-md border border-line bg-ink/60 px-3 py-2 font-mono text-sm text-ash outline-none transition focus:border-signal focus:ring-1 focus:ring-signal/40 disabled:cursor-not-allowed disabled:opacity-40'
                            >
                                <option value=''>select…</option>
                                {field.options.map((opt) => (
                                    <option key={opt} value={opt}>
                                        {opt}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <input
                                value={values[field.name]}
                                disabled={disabled}
                                placeholder={urlOptionalForCupsonline ? 'auto-create rooms if left blank' : undefined}
                                onChange={(e) => handleChange(field.name, e.target.value)}
                                className='rounded-md border border-line bg-ink/60 px-3 py-2 font-mono text-sm text-ash outline-none transition focus:border-signal focus:ring-1 focus:ring-signal/40 disabled:cursor-not-allowed disabled:opacity-40'
                            />
                        )}
                        {errors[field.name] && <span className='error text-xs font-normal text-fault'>{errors[field.name]}</span>}
                    </label>
                );
            })}
            {submitting && willBootstrapRooms && (
                <p className='flex items-center gap-2 text-xs text-ash/50'>
                    <span className='h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-signal' aria-hidden='true' />
                    creating rooms on cups.online — this can take up to a minute, don't close this
                </p>
            )}
            {errors._submit && <p className='error text-xs font-normal text-fault'>{errors._submit}</p>}
            <button
                type='submit'
                disabled={submitting}
                className='mt-1 self-start rounded-md bg-signal px-4 py-2 text-sm font-semibold text-ink transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-signal/40 active:scale-[0.98] active:brightness-95 disabled:cursor-not-allowed disabled:opacity-60'
            >
                {submitting ? (isEdit ? 'Saving…' : 'Creating…') : isEdit ? 'Save changes' : 'Create client'}
            </button>
        </form>
    );
}
