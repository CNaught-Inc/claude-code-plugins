/**
 * Carbon Rename Project Script
 *
 * Updates the project name used for carbon tracking.
 * Re-resolves the project identifier and updates all sessions
 * matching the current project in the database.
 *
 * Usage:
 *   carbon-rename-project.ts --name "New Name"
 *   carbon-rename-project.ts --reset
 */

import {
    deleteProjectConfig,
    initializeDatabase,
    openDatabase,
    setProjectConfig
} from '../data-store';
import { resolveProjectIdentifier, shortHash } from '../project-identifier';
import { logError } from '../utils/stdin';

function main(): void {
    const nameIndex = process.argv.indexOf('--name');
    const newName = nameIndex !== -1 ? process.argv[nameIndex + 1] : null;
    const shouldReset = process.argv.includes('--reset');

    const db = openDatabase();
    try {
        initializeDatabase(db);

        // Get the current project identifier before any changes
        const projectHash = shortHash(process.cwd());
        const oldIdentifier = resolveProjectIdentifier(process.cwd());

        if (shouldReset) {
            // Remove the custom name so auto-detection kicks in
            deleteProjectConfig(db, projectHash, 'project_name');
        } else if (newName) {
            setProjectConfig(db, projectHash, 'project_name', newName);
        } else {
            console.log('Error: provide --name "Name" or --reset');
            return;
        }

        // Re-resolve after updating config
        const newIdentifier = resolveProjectIdentifier(process.cwd());

        if (oldIdentifier !== newIdentifier) {
            // Update all sessions with the old identifier to the new one
            const result = db
                .prepare(
                    'UPDATE sessions SET project_identifier = ?, needs_sync = 1 WHERE project_identifier = ?'
                )
                .run(newIdentifier, oldIdentifier);

            console.log(
                `Renamed project from "${oldIdentifier}" to "${newIdentifier}" (${result.changes} session(s) updated).`
            );
        } else {
            console.log(`Project is already "${newIdentifier}" — no changes needed.`);
        }
    } catch (error) {
        logError('Failed to rename project', error);
    } finally {
        db.close();
    }
}

main();
