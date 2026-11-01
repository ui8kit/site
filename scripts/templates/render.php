<?php
// Renders every template under <root>/{ui,compose,blocks} with empty props (Twig or Latte runtime of ui8kit installed by the CLI:
// kit runtime/ + kit-compose compose/ and organisms/ in one template root) and prints {"<template>": "<html>" | "ERROR: <message>"}
// as JSON. Wiring as packages/kit-compose/test/server/render-organisms.php. Usage: php render.php twig|latte <root>
declare(strict_types=1);
[$self, $rt, $root] = $argv;
$root = (string) realpath($root);
require $root . '/vendor/autoload.php';
foreach (glob($root . '/runtime/*.php') ?: [] as $f) require_once $f;
foreach (glob($root . '/compose/*.php') ?: [] as $f) require_once $f;
foreach (['CnMerge', 'Runtime', 'OrganismExtension'] as $f) if (is_file("$root/organisms/$f.php")) require_once "$root/organisms/$f.php";
$ext = $rt === 'twig' ? '.html.twig' : '.latte';
if ($rt === 'twig') {
    $env = new \Twig\Environment(new \Twig\Loader\FilesystemLoader([$root]), ['autoescape' => 'html', 'strict_variables' => false, 'cache' => false]);
    $env->addExtension(new \UI8Kit\Twig\TwigExtension());
    $env->addExtension(new \CodegenX\Compose\Twig\ComposeExtension());
    $env->addExtension(new \CodegenX\Organisms\Twig\OrganismExtension($root));
} else {
    $env = new \Latte\Engine();
    $env->setTempDirectory(sys_get_temp_dir() . '/ui8kit-latte-' . md5($root));
    $env->setLoader(new \Latte\Loaders\FileLoader($root));
    $env->addExtension(new \CodegenX\Organisms\Latte\OrganismExtension($root, $env));
}
$files = [];
foreach (['ui', 'compose', 'blocks'] as $top) {
    if (!is_dir("$root/$top")) continue;
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator("$root/$top", FilesystemIterator::SKIP_DOTS));
    foreach ($it as $f) if (str_ends_with($f->getPathname(), $ext)) $files[] = substr($f->getPathname(), strlen($root) + 1);
}
sort($files);
$out = [];
foreach ($files as $t) {
    try {
        $out[$t] = $rt === 'twig' ? $env->render($t, ['p' => []]) : $env->renderToString($t, ['p' => []]);
    } catch (\Throwable $e) {
        $out[$t] = 'ERROR: ' . $e->getMessage();
    }
}
echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE), "\n";
