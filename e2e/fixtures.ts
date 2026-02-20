import { test as base } from '@playwright/test';
import { ApiHelper } from './helpers/api';

type Fixtures = {
  apiHelper: ApiHelper;
};

export const test = base.extend<Fixtures>({
  apiHelper: async ({ request }, use) => {
    const helper = new ApiHelper(request);
    // Clean slate before each test
    await helper.deleteAllTasks();
    await use(helper);
  },
});

export { expect } from '@playwright/test';
