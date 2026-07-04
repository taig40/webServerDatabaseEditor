import os
import glob
import codecs

class NpcShopParser:
    def __init__(self, npc_folder_path: str):
        self.npc_folder = npc_folder_path
        # shops dict: { shop_name: { map, x, y, sprite_id, name, items: { item_id: price } } }
        self.shops = []
        # item_to_shops: { item_id: [shop1, shop2] }
        self.item_to_shops = {}
        self.loaded = False

    def load(self):
        print(f"[webSDE] Parsing NPC shops from: {self.npc_folder} ...")
        self.shops = []
        self.item_to_shops = {}
        
        # Load all .txt files recursively
        search_pattern = os.path.join(self.npc_folder, "**", "*.txt")
        files = glob.glob(search_pattern, recursive=True)
        
        for file_path in files:
            try:
                with codecs.open(file_path, 'r', 'utf-8', errors='ignore') as f:
                    for line_num, line in enumerate(f):
                        line = line.strip()
                        if not line or line.startswith("//"):
                            continue
                        
                        # Check for shop or cashshop
                        if '\tshop\t' in line or '\tcashshop\t' in line or '\titemshop\t' in line:
                            self._parse_shop_line(line, file_path, line_num + 1)
            except Exception as e:
                # print(f"Error parsing {file_path}: {e}")
                pass
                
        # Build inverse index
        for shop in self.shops:
            for item_id in shop['items'].keys():
                if item_id not in self.item_to_shops:
                    self.item_to_shops[item_id] = []
                self.item_to_shops[item_id].append(shop)
                
        self.loaded = True
        print(f"[webSDE] Loaded {len(self.shops)} NPC Shops successfully.")

    async def load_async(self):
        import asyncio
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self.load)

    def _parse_shop_line(self, line: str, file_path: str, line_num: int):
        # prontera,156,212,4<TAB>shop<TAB>Weapon Dealer#123<TAB>114,1202:150,1203:200
        parts = line.split('\t')
        
        # Finding the shop type index
        shop_idx = -1
        for i, p in enumerate(parts):
            if p in ('shop', 'cashshop', 'itemshop'):
                shop_idx = i
                break
                
        if shop_idx == -1 or shop_idx < 1 or shop_idx + 2 >= len(parts):
            return
            
        location_part = parts[shop_idx - 1]
        shop_type = parts[shop_idx]
        name_part = parts[shop_idx + 1]
        items_part = parts[shop_idx + 2]
        
        # Parse location: map,x,y,facing
        loc_split = location_part.split(',')
        map_name = loc_split[0] if len(loc_split) > 0 else "-"
        x = int(loc_split[1]) if len(loc_split) > 1 and loc_split[1].isdigit() else 0
        y = int(loc_split[2]) if len(loc_split) > 2 and loc_split[2].isdigit() else 0
        
        # Parse name (remove hidden #id)
        display_name = name_part.split('#')[0]
        
        # Parse items_part: sprite_id,item_id:price,item_id:price
        # Note: sprite_id can be negative (e.g. -1 for invisible) or string (e.g. 1_M_WEAPONDEALER)
        # However, it's typically comma separated from the items.
        
        # Sometimes there's spaces instead of comma between sprite_id and first item?
        # Standard: sprite_id,item:price,item:price
        items_str_list = items_part.split(',')
        sprite_id_str = items_str_list[0].strip()
        
        sprite_id = None
        if sprite_id_str.lstrip('-').isdigit():
            sprite_id = int(sprite_id_str)
        else:
            sprite_id = sprite_id_str # could be a string AegisName for monster sprite!
            
        shop_items = {}
        for item_data in items_str_list[1:]:
            item_data = item_data.strip()
            if not item_data: continue
            
            # item_id:price
            if ':' in item_data:
                it, price = item_data.split(':', 1)
                if it.isdigit():
                    shop_items[int(it)] = int(price) if price.lstrip('-').isdigit() else -1
                else:
                    # It could be an AegisName! (e.g. Red_Potion:-1)
                    # For simplicity, we store the string, and the API can resolve it later,
                    # or we can resolve it using yaml_db if we want, but storing as string is fine.
                    shop_items[it] = int(price) if price.lstrip('-').isdigit() else -1
            else:
                # No price specified? rAthena doesn't usually do this, but fallback:
                if item_data.isdigit():
                    shop_items[int(item_data)] = -1
                else:
                    shop_items[item_data] = -1
                    
        shop_obj = {
            'map': map_name,
            'x': x,
            'y': y,
            'type': shop_type,
            'name': display_name,
            'full_name': name_part,
            'sprite_id': sprite_id,
            'items': shop_items,
            'file': os.path.basename(file_path),
            'line': line_num
        }
        
        self.shops.append(shop_obj)

    def get_shops_selling_item(self, item_id: int, item_aegis: str = None):
        """Returns a list of shops that sell the given item ID or AegisName."""
        found_shops = []
        
        # Check by ID
        if item_id in self.item_to_shops:
            found_shops.extend(self.item_to_shops[item_id])
            
        # Check by AegisName
        if item_aegis and item_aegis in self.item_to_shops:
            for s in self.item_to_shops[item_aegis]:
                if s not in found_shops:
                    found_shops.append(s)
                    
        return found_shops

# Singleton instance
npc_db = NpcShopParser(r"C:\Users\taiga\Documents\rAthena\emulador\rathena\npc")
