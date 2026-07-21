from app.services.divine_pride_adapter import dp_adapter
from app.models.mob import MobDBModel, MobDBModelUpdate

MVP_RAW = {
    'id': 21361, 'dbname': 'EP18_MD_DEMI_FREYJA_L', 'name': 'EP18 Freyja L',
    'sprite': 'ep18_md_demi_freyja',
    'stats': {
        'attackRange': 3, 'level': 224, 'health': 2000000000, 'sp': 0,
        'str': 257, 'int': 145, 'vit': 146, 'dex': 170, 'agi': 178, 'luk': 199,
        'rechargeTime': 736, 'atk1': 8244, 'atk2': 1053,
        'attack': {'minimum': 7076, 'maximum': 10373},
        'defense': 314, 'baseExperience': 0, 'jobExperience': 0,
        'aggroRange': 10, 'escapeRange': 12, 'movementSpeed': 150,
        'attackSpeed': 1104, 'attackedSpeed': 480,
        'element': 46, 'scale': 1, 'race': 8, 'magicDefense': 520,
        'ai': 'MONSTER_TYPE_21', 'mvp': 1, 'class': 1,
        'res': 249, 'mres': 499
    },
    'drops': [
        {'itemId': 512, 'chance': 0},
        {'itemId': 300228, 'chance': 1, 'stealProtected': True},
    ],
    'mvpdrops': [
        {'itemId': 607, 'chance': 5000},
        {'itemId': 616, 'chance': 1000},
        {'itemId': 512, 'chance': 0},
    ],
    'skill': [
        {'skillId': 190, 'status': 'BERSERK_ST', 'level': 4, 'chance': 300, 'casttime': 0, 'delay': 5000, 'interruptable': True, 'condition': None, 'conditionValue': None},
        {'skillId': 26,  'status': 'IDLE_ST',    'level': 1, 'chance': 1000,'casttime': 0, 'delay': 0,     'interruptable': True, 'condition': 'IF_RUDEATTACK',   'conditionValue': None},
        {'skillId': 26,  'status': 'RUSH_ST',    'level': 1, 'chance': 300, 'casttime': 0, 'delay': 300000,'interruptable': True, 'condition': 'IF_MONSTERCOUNT', 'conditionValue': '23'},
    ]
}

GUARD_RAW = {
    'id': 21310, 'dbname': 'EP18_MD_GUARD_A', 'name': 'Guard',
    'sprite': 'ep18_md_guard_a',
    'stats': {
        'attackRange': 1, 'level': 179, 'health': 1831096, 'sp': 0,
        'str': 130, 'int': 56, 'vit': 145, 'dex': 130, 'agi': 118, 'luk': 66,
        'rechargeTime': 648,
        'attack': {'minimum': 2636, 'maximum': 3799},
        'defense': 614, 'baseExperience': 0, 'jobExperience': 0,
        'aggroRange': 10, 'escapeRange': 12, 'movementSpeed': 150,
        'attackSpeed': 648, 'attackedSpeed': 480,
        'element': 40, 'scale': 1, 'race': 7, 'magicDefense': 97,
        'ai': 'MONSTER_TYPE_04', 'mvp': 0, 'class': 0, 'res': 0, 'mres': 0
    },
    'drops': [{'itemId': 512, 'chance': 0}] * 8,
    'mvpdrops': [], 'skill': []
}

checks = {
    'MVP': {
        'SpriteName': 'ep18_md_demi_freyja',
        'Element': 'Holy',
        'ElementLevel': 4,
        'AttackDelay': 736,
        'AttackMotion': 1104,
        'DamageMotion': 480,
        'Class': 'Boss',
        'Resistance': 249,
        'MagicResistance': 499,
        'Ai': '21',
        'MvpDrops': [{'Item': 607, 'Rate': 5000}, {'Item': 616, 'Rate': 1000}],
    },
    'Guard': {
        'SpriteName': 'ep18_md_guard_a',
        'Element': 'Neutral',
        'ElementLevel': 4,
        'AttackDelay': 648,
        'DamageMotion': 480,
        'Ai': '04',
        # Class: Normal → omitted
        # Resistance/MR: 0 → omitted
    }
}

all_ok = True
for label, raw, expected in [('MVP', MVP_RAW, checks['MVP']), ('Guard', GUARD_RAW, checks['Guard'])]:
    print(f'=== {label} ===')
    r = dp_adapter.adapt_monster(raw)
    for k, v in r.items():
        if k == 'MobSkills':
            print(f'  MobSkills ({len(v)} entries):')
            for sk in v:
                print(f'    {sk}')
        else:
            print(f'  {k}: {v!r}')
    print()
    print('  CHECKS:')
    for k, expected_v in expected.items():
        actual = r.get(k, '(omitted)')
        status = 'OK' if actual == expected_v else 'FAIL'
        if status == 'FAIL':
            all_ok = False
        print(f'    [{status}] {k}: expected={expected_v!r}, got={actual!r}')
    if label == 'Guard':
        for k in ('Class', 'Resistance', 'MagicResistance'):
            status = 'OK' if k not in r else 'FAIL'
            if status == 'FAIL':
                all_ok = False
            print(f'    [{status}] {k} omitted (default)')
    
    # Test strict Pydantic V2 validation!
    # Note: MobDBModel does not include MobSkills (which are handled by the separate skill endpoint/table),
    # so we filter them out before checking MobDBModel / MobDBModelUpdate instantiation just like the controller does.
    clean_r = {k: v for k, v in r.items() if k != 'MobSkills'}
    try:
        model = MobDBModel(**clean_r)
        print(f'    [OK] MobDBModel(**clean_r) valid!')
    except Exception as e:
        print(f'    [FAIL] MobDBModel validation error: {e}')
        all_ok = False
    print()

if all_ok:
    print('All checks passed successfully!')
else:
    print('Some checks failed.')
