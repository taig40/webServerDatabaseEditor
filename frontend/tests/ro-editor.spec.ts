import { test, expect } from '@playwright/test';

test.describe('rAthena Web Editor E2E Tests', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    const setupInput = page.getByPlaceholder(/C:\/rAthena\/db/i);
    const loadingScreen = page.getByText(/Carregando Bancos de Dados|Loading rAthena/i);

    try {
      await Promise.race([
        setupInput.waitFor({ state: 'visible', timeout: 5000 }),
        loadingScreen.waitFor({ state: 'visible', timeout: 5000 })
      ]);
    } catch (e) {
      // Ignore if neither appear immediately
    }

    if (await setupInput.isVisible()) {
      await setupInput.fill(process.env.TEST_DB_PATH || 'C:/rAthena/db');
      await page.getByPlaceholder(/data\.grf/i).fill(process.env.TEST_GRF_PATH || 'C:/Ragnarok/data.grf');
      await page.getByPlaceholder(/itemInfo\.lub/i).fill(process.env.TEST_LUA_PATH || 'C:/Ragnarok/System/itemInfo.lua');
      await page.getByRole('button', { name: /Salvar e Iniciar|Save and Start/i }).click();
    }

    // Aumentamos o timeout dessa verificação específica para 10 minutos,
    // pois a carga inicial da GRF e dos YAMLs do rAthena é pesada.
    await expect(loadingScreen).toBeHidden({ timeout: 600000 });

    // Cenário 4: Prevenção de Falsos Positivos - falha o teste caso qualquer requisição retorne 500
    page.on('response', response => {
      if (response.status() === 500) {
        console.error(`\x1b[31m[CRITICAL ERROR] API retornou 500 na rota: ${response.url()}\x1b[0m`);
        expect(response.status(), `A rota ${response.url()} não deve retornar 500`).not.toBe(500);
      }
    });
  });

  test('Cenário 1: CRUD Server e Data Binding (Client DB)', async ({ page }) => {
    // Navigate to Client Items Database
    await page.getByTestId('menu-client_items').click();

    // Search for Hat (ID 2220) if necessary, or just wait for it to be rendered
    // We can use the Search input or directly click the row if it's visible. 
    // Usually, 2220 will be in the list. Let's search for it to be sure.
    const searchInput = page.getByPlaceholder(/Pesquisar/i).or(page.getByPlaceholder(/Search/i));
    await searchInput.fill('2220');
    await page.keyboard.press('Enter');

    // Click on the row
    await page.getByTestId('item-list-row-2220').click();

    // Navigate to "Visual Configuration"
    await page.getByTestId('tab-visual').click();

    // Verify Data Binding worked and View ID is 16
    const viewIdInput = page.getByTestId('input-viewid');
    await expect(viewIdInput).toHaveValue('16');
  });

  test('Cenário 2: Validação de Encoding e Assets', async ({ page }) => {
    // Set up interceptor to check for fallback characters
    page.on('request', request => {
      const url = request.url();
      if (url.includes('.bmp') || url.includes('.spr') || url.includes('.act')) {
        // %EF%BF%BD is the URL encoded replacement character ''
        expect(url, 'Encoding mismatch detected (fallback character in URL)').not.toContain('%EF%BF%BD');
        expect(url, 'Encoding mismatch detected (fallback character in URL)').not.toContain('');
      }
    });

    await page.getByTestId('menu-client_items').click();

    const searchInput = page.getByPlaceholder(/Pesquisar/i).or(page.getByPlaceholder(/Search/i));
    await searchInput.fill('2220');
    await page.keyboard.press('Enter');

    await page.getByTestId('item-list-row-2220').click();
    await page.getByTestId('tab-basic').click();

    // Wait for the resource name input to be visible which triggers asset loading
    await expect(page.getByTestId('input-resourcename')).toBeVisible();

    // Give some time for images to load
    await page.waitForTimeout(1000);
  });

  test('Cenário 3: Motor do Vestiário (Visualizer API)', async ({ page }) => {
    await page.getByTestId('menu-client_items').click();

    const searchInput = page.getByPlaceholder(/Pesquisar/i).or(page.getByPlaceholder(/Search/i));
    await searchInput.fill('2220');
    await page.keyboard.press('Enter');

    await page.getByTestId('item-list-row-2220').click();
    await page.getByTestId('tab-visual').click();

    // Clear and insert a valid Resource Name if not present, but 2220 already has one.
    // Let's just type a specific one to trigger the visualizer explicitly.
    // Since we're in the visual tab, let's locate the resource name input (name). 
    // It is placeholder="Ex: _CustomWings". We can just rely on the existing one or type "_Hat"
    // The VisualEquipmentForm has an input for Sprite Name. Let's find it by data-testid.
    const spriteNameInput = page.getByTestId('input-resourcename');
    await spriteNameInput.waitFor({ state: 'visible' });
    await spriteNameInput.clear();

    // Wait for response to /api/visualizer/preview
    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/api/visualizer/preview')
    );

    // Type resource name
    await spriteNameInput.fill('_HAT'); // Use '_HAT' to maintain consistency with item ID 2220

    const response = await responsePromise;

    // Assert 200 and image/png
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');

    // Assert visual canvas is visible
    const canvas = page.getByTestId('visualizer-canvas');
    await expect(canvas).toBeVisible();

    // Toggle gender
    const genderButton = page.getByRole('button', { name: /Male|Female|Masculino|Feminino/i });

    const genderResponsePromise = page.waitForResponse(response =>
      response.url().includes('/api/visualizer/preview')
    );
    await genderButton.click();
    const genderResponse = await genderResponsePromise;

    expect(genderResponse.status()).toBe(200);
  });
  test('Cenário 4: Motor de Busca e Filtro (Search Engine)', async ({ page }) => {
    await page.getByTestId('menu-items').click();

    const searchInput = page.getByTestId('input-search');
    await searchInput.fill('2220');
    await page.keyboard.press('Enter');

    // The list should shrink and 2220 should be visible
    const itemRow = page.getByTestId('item-list-row-2220');
    await expect(itemRow).toBeVisible();

    await searchInput.clear();
    await page.keyboard.press('Enter');
  });

  test('Cenário 5: Ciclo CRUD Completo (Create & Delete)', async ({ page }) => {
    await page.getByTestId('menu-items').click();

    // Create
    await page.getByTestId('btn-new-item').click();

    const idInput = page.locator('input[name="Id"]');
    await idInput.fill('99999');

    const aegisNameInput = page.locator('input[name="AegisName"]');
    await aegisNameInput.fill('_QA_TEST_ITEM_');

    const nameInput = page.locator('input[name="Name"]');
    await nameInput.fill('QA Test Item');

    // Submit
    await page.locator('button[type="submit"]').click();

    // Check Toast / item exists
    const toastMessage = page.getByTestId('toast-message');
    await expect(toastMessage).toBeVisible({ timeout: 5000 });

    const itemRow = page.getByTestId('item-list-row-99999');
    await expect(itemRow).toBeVisible({ timeout: 5000 });
    await itemRow.click();

    // Delete
    await page.getByTestId('btn-delete-item').click();
    await page.getByTestId('btn-confirm-delete').click();

    // Check Toast / item is gone
    await expect(toastMessage.nth(1)).toBeVisible({ timeout: 5000 });
    await expect(itemRow).toBeHidden({ timeout: 5000 });
  });

  test('Cenário 6: Auditoria de Rotas (Sidebar Navigation)', async ({ page }) => {
    // Navigate to Quests
    await page.getByTestId('menu-server_quests').click();
    await expect(page.locator('h2').filter({ hasText: /Quests/i })).toBeVisible();

    // Navigate to Pets
    await page.getByTestId('menu-pets').click();
    await expect(page.locator('h2').filter({ hasText: /Mascotes/i })).toBeVisible();

    // Navigate to Achievements
    await page.getByTestId('menu-server_achievements').click();
    await expect(page.locator('h2').filter({ hasText: /Conquistas/i })).toBeVisible();
  });

  test('Cenário 7: Validação de Formulário (Bad Inputs)', async ({ page }) => {
    await page.getByTestId('menu-items').click();

    // Create
    await page.getByTestId('btn-new-item').click();

    // Leave ID as 0 or empty, and AegisName empty
    const idInput = page.locator('input[name="Id"]');
    await idInput.fill('0');

    // Submit
    await page.locator('button[type="submit"]').click();

    // The system should block and show an error in the form (or toast)
    // The NewItemModal has a generic error div:
    // {error && <div className="bg-red-900/50 ...">{error}</div>}
    const errorDiv = page.locator('form div.bg-red-900\\/50');
    await expect(errorDiv).toBeVisible({ timeout: 3000 });
  });
});
