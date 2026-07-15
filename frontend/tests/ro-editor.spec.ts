import { test, expect } from '@playwright/test';

test.describe('rAthena Web Editor E2E Tests', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Aumentamos o timeout dessa verificação específica para 90s,
    // pois a carga inicial da GRF e dos YAMLs do rAthena é pesada.
    await expect(page.getByText(/Carregando Bancos de Dados|Loading rAthena/i)).toBeHidden({ timeout: 90000 });

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
    const searchInput = page.getByPlaceholder(/Buscar/i).or(page.getByPlaceholder(/Search/i));
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
    
    const searchInput = page.getByPlaceholder(/Buscar/i).or(page.getByPlaceholder(/Search/i));
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

    const searchInput = page.getByPlaceholder(/Buscar/i).or(page.getByPlaceholder(/Search/i));
    await searchInput.fill('2220');
    await page.keyboard.press('Enter');

    await page.getByTestId('item-list-row-2220').click();
    await page.getByTestId('tab-visual').click();

    // Clear and insert a valid Resource Name if not present, but 2220 already has one.
    // Let's just type a specific one to trigger the visualizer explicitly.
    // Since we're in the visual tab, let's locate the resource name input (name). 
    // It is placeholder="Ex: _CustomWings". We can just rely on the existing one or type "_Hat"
    // The VisualEquipmentForm has an input for Sprite Name. Let's find it by placeholder or label.
    const spriteNameInput = page.getByLabel(/Sprite Name|Resource Name/i);
    
    // Wait for response to /api/visualizer/preview
    const responsePromise = page.waitForResponse(response => 
      response.url().includes('/api/visualizer/preview')
    );

    // Type resource name
    await spriteNameInput.fill('모자'); // Example valid korean resource name or we can use existing
    
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
});
