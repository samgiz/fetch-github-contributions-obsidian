import { App, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
// Remember to rename these classes and interfaces!

interface PluginSettings {
	base_directory: string;
	starting_year: number;
	username: string;
}

const DEFAULT_SETTINGS: PluginSettings = {
	base_directory: '_github_data',
	starting_year: 2008, // GitHub was founded in 2008
	username: 'username',
}

export default class FetchGithubDataPlugin extends Plugin {
  settings: PluginSettings;
  async onload() {
    // Set up settings
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.addSettingTab(new FetchGithubDataTab(this.app, this));
    this.addCommand({
      id: 'fetch',
      name: 'Fetch GitHub Data',
      callback: () => this.fetchGitHubData(),
    });
  }

  async fetchContributionsForYear(username: string, year: number) {
    const url = `https://github.com/users/${username}/contributions?from=${year}-01-01&to=${year}-12-31`;
    const response = await fetch(url);
    const body = await response.text();
    return body;
  }

  parseContributionData(html: string) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const elements = doc.querySelectorAll('td.ContributionCalendar-day');
    const contributions: Record<string, number> = {};

    elements.forEach(elem => {
        const countText = elem.querySelector('span')?.textContent;
        if (countText === null || countText === undefined) {
          console.log('No count text found for element', elem)
          return;
        }
        const match = countText.match(/(\d+) contributions?/);
        const count = match ? parseInt(match[1], 10) : 0;
        const date = elem.getAttribute('data-date');
        if (date == null) {
          console.log('No date found for element', elem)
          return;
        }
        if (date && count > 0) {
            contributions[date] = count;
        }
    });

    return contributions;
  }

  async saveDataToFile(data: Record<string, number>, year: number) {
    // Fetch obsidian settings value for base directory
    const baseDirectory = this.settings.base_directory;
    const filePath = `${baseDirectory}/${year}.json`;
    const file = this.app.vault.getAbstractFileByPath(filePath);
    
    if (file instanceof TFile) {
      // Update the existing file
      this.app.vault.modify(file, JSON.stringify(data));
    } else {
      // Create a new file
      this.app.vault.create(filePath, JSON.stringify(data));
    }
  }

  async fetchGitHubData() {
    const baseDirectory = this.app.vault.getAbstractFileByPath(this.settings.base_directory);
    if (!baseDirectory) {
      await this.app.vault.createdirectory(this.settings.base_directory);
    }
    for (let year = this.settings.starting_year; year <= new Date().getFullYear(); year++) {
      this.fetchContributionsForYear(this.settings.username, year)
        .then(this.parseContributionData)
        .then(data => this.saveDataToFile(data, year))
    }
  }

  saveSettings() {
    this.saveData(this.settings);
  }
};

class FetchGithubDataTab extends PluginSettingTab {
  plugin: FetchGithubDataPlugin;

  constructor(app: App, plugin: FetchGithubDataPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName('Username')
      .setDesc('The github username to fetch contribution statistics for')
      .addText(text => text
        .setPlaceholder('username')
        .setValue(this.plugin.settings.username)
        .onChange(async (value) => {
          this.plugin.settings.username = value;
          await this.plugin.saveSettings();
        }));
    new Setting(containerEl)
      .setName('Initial Year')
      .setDesc("Specifies the year to start fetching data from (data is fetched in one year intervals). The last year will always be the current year, and the default is 2008, the year GitHub was founded. In theory after fetching data for the first time, you can set this to the current year and it will only fetch data from that year onwards. I'm not optimising that myself because there aren't that many years to fetch anyways.")
      .addText(text => text
        .setPlaceholder('2008')
        .setValue(this.plugin.settings.starting_year.toString())
        .onChange(async (value) => {
          this.plugin.settings.starting_year = Number(value);
          await this.plugin.saveSettings();
        })
        .inputEl.setAttribute('type', 'number'))
    new Setting(containerEl)
      .setName('Base Directory')
      .setDesc("Where to store the fetched contributions data. Defaults to a directory called '_github_data' in the root of your vault. The data for each year will be stored in a file called '{year}.json' in this directory.")
      .addText(text => text
        .setPlaceholder('_github_data')
        .setValue(this.plugin.settings.base_directory)
        .onChange(async (value) => {
          this.plugin.settings.base_directory = value;
          await this.plugin.saveSettings();
        }));
  }
}
