/**
 * Carbon Rename Team Script
 *
 * Updates the team name for anonymous carbon tracking.
 *
 * Usage:
 *   carbon-rename-team.ts --name "New Team"
 */

import '../utils/load-env';

import { getConfig, initializeDatabase, openDatabase, setConfig } from '../data-store';
import { getArgValue, validateName } from '../utils/args';
import { logError } from '../utils/stdin';

function main(): void {
    const newName = getArgValue('--name');

    if (newName === null) {
        console.log('Error: provide --name "Team Name"');
        process.exit(1);
    }

    const error = validateName(newName, 100);
    if (error) {
        console.error(`Team: ${error}`);
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

        const oldTeam = getConfig(db, 'claude_code_team') || '';
        setConfig(db, 'claude_code_team', newName);

        if (oldTeam) {
            console.log(`Updated team from "${oldTeam}" to "${newName}".`);
        } else {
            console.log(`Team set to "${newName}".`);
        }
    } catch (error) {
        logError('Failed to update team', error);
    } finally {
        db.close();
    }
}

main();
