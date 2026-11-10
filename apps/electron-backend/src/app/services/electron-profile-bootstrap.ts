import { app } from 'electron';
import { getElectronUserDataPath } from '@iptvnator/shared/database';
import { activateSourceServerProfile } from './source-server-config';

activateSourceServerProfile();

// NaviTV never adopts a pre-0.20 IPTVnator profile (appData/electron-backend)
// as its own userData: that would write into the other app's profile. The
// opt-in "recover legacy sources" dialog still reads a disposable copy.
const override = getElectronUserDataPath();
if (override) app.setPath('userData', override);
