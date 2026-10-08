// Kept as a stable import path for the server integration. The implementation
// lives beside the test-only memory store so both conform to one transaction API.
export { OperationsStoreError, createFirestoreOperationsStore } from './store.mjs';
