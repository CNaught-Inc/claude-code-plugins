/**
 * Carbonlog Rename Project Script
 *
 * Updates the project name used for carbonlog tracking.
 * Re-resolves the project identifier and updates all sessions
 * matching the current project in the database.
 *
 * Usage:
 *   carbonlog-rename-project.ts --name "New Name"
 *   carbonlog-rename-project.ts --reset
 */

import '../utils/load-env';

import {
    deleteProjectConfig,
    initializeDatabase,
    openDatabase,
    setProjectConfig
} from '../data-store';
import { resolveProjectIdentifier, shortHash } from '../project-identifier';
import { getArgValue, hasFlag, validateName } from '../utils/args';
import { logError } from '../utils/stdin';

function main(): void {
    const newName = getArgValue('--name');
    const shouldReset = hasFlag('--reset');

    if (newName !== null) {
        const error = validateName(newName, 100);
        if (error) {
            console.error(`Project name: ${error}`);
            process.exit(1);
        }
    }

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
                    "UPDATE sessions SET project_identifier = ?, sync_status = CASE WHEN sync_status IN ('synced', 'failed') THEN 'dirty' ELSE sync_status END WHERE project_identifier = ?"
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
