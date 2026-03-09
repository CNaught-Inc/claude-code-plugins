/**
 * Carbon Rename User Script
 *
 * Updates the organization name for anonymous carbon tracking.
 *
 * Usage:
 *   carbon-rename-user.ts --name "New Organization"
 */

import '../utils/load-env';

import { getConfig, initializeDatabase, openDatabase, setConfig } from '../data-store';
import { getArgValue, validateName } from '../utils/args';
import { logError } from '../utils/stdin';

function main(): void {
    const newName = getArgValue('--name');

    if (newName === null) {
        console.log('Error: provide --name "Organization Name"');
        process.exit(1);
    }

    const error = validateName(newName, 100);
    if (error) {
        console.error(`Organization: ${error}`);
        process.exit(1);
    }

    const db = openDatabase();
    try {
        initializeDatabase(db);

        const userId = getConfig(db, 'claude_code_user_id');
        if (!userId) {
            console.log(
                'Sync is not enabled. Run /carbon:setup first to enable anonymous tracking.'
            );
            return;
        }

        const oldOrg = getConfig(db, 'claude_code_organization') || '';
        setConfig(db, 'claude_code_organization', newName);

        if (oldOrg) {
            console.log(`Updated organization from "${oldOrg}" to "${newName}".`);
        } else {
            console.log(`Organization set to "${newName}".`);
        }
    } catch (error) {
        logError('Failed to update organization', error);
    } finally {
        db.close();
    }
}

main();
