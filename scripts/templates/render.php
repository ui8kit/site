<?php
// Renders every template under <root>/ui and <root>/blocks with empty props (Twig or Latte runtime of ui8kit installed by the CLI)
// and prints {"<template>": "<html>" | "ERROR: <message>"} as JSON. Usage: php render.php twig|latte <root>
declare(strict_types=1);
[$self, $rt, $root] = $argv;
require $root . '/vendor/autoload.php';
$ext = $rt === 'twig' ? '.html.twig' : '.latte';
$env = $rt === 'twig'
    ? \UI8Kit\Twig\Extension::environment($root, ['strict_variables' => false])
    : \UI8Kit\Latte\Extension::engine($root);
$files = [];
foreach (['ui', 'blocks'] as $top) {
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
