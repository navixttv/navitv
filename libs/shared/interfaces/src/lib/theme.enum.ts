export enum Theme {
    DarkTheme = 'DARK_THEME',
    LightTheme = 'LIGHT_THEME',
    SystemTheme = 'SYSTEM_THEME',
    CreamTheme = 'CREAM_THEME',
    MochaTheme = 'MOCHA_THEME',
    NightOwlTheme = 'NIGHT_OWL_THEME',
    BlackOledTheme = 'BLACK_OLED_THEME',
}

/** NaviTV opens in the Dark theme until the user picks another one. */
export const DEFAULT_THEME = Theme.DarkTheme;
